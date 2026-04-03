// 引入微信全局录音管理器
const recorderManager = wx.getRecorderManager();

Page({
  data: {
    statusBarHeight: 20,
    enableSound: true, // 控制声音开关，默认开启
    chatHistory: [], // 保存的历史对话
    envelopes: [],   // 控制草地上的信封显示
    showHistory: false, // 控制历史对话弹窗的显示
    latestAIMessage: {
      id: 'init',
      role: 'ai',
      content: '你好呀！我是你的AI好朋友。\n你想知道为什么天空是蓝色的吗？快来告诉我吧！',
      formattedContent: '<div class="msg-paragraph">你好呀！我是你的AI好朋友。</div><div class="msg-paragraph">你想知道为什么天空是蓝色的吗？快来告诉我吧！</div>',
      loading: false
    },
    inputText: '',
    showTextInput: false,
    isRecording: false,
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20
    });

    this.initRecord();
    this.initAudioPlayer(); // ✨ 初始化音频播放器
    
    // 小程序启动时，唤醒那些沉睡的回忆~ ✨
    this.loadChatHistoryFromCloud();
  },

  // 初始化小程序音频上下文
  initAudioPlayer() {
    // ✨ 在微信开发者工具和 Windows 微信上，推荐使用 createWebAudioContext 或直接让 innerAudioContext 自动解析，
    // 但保险起见，我们重新初始化它，并在每次播放前重置 src。
    this.innerAudioContext = wx.createInnerAudioContext();
    this.innerAudioContext.onPlay(() => {
      console.log('✨ 小动物开始说话啦');
    });
    this.innerAudioContext.onError((res) => {
      console.error('音频播放出错了:', res.errMsg, res.errCode);
      // 有时候在 PC 端或开发者工具上，可能因为解码器不支持某些特定格式报错
      wx.showToast({ title: '哎呀，我嗓子哑了，没法说话啦', icon: 'none' });
    });
  },

  // ✨ 调用云函数进行语音合成并播放
  async playVoice(text) {
    // 如果声音开关关闭，或者没有文本，就不出声
    if (!this.data.enableSound || !text) return;

    try {
      console.log('正在将文字转换为声音...');
      
      const result = await wx.cloud.callFunction({
        name: 'textToVoice',
        data: { text: text }
      });

      const resData = result.result;
      
      if (resData && resData.code === 0 && resData.audioBase64) {
        // 腾讯云返回的是 Base64 编码的音频数据
        const fsm = wx.getFileSystemManager();
        const filePath = `${wx.env.USER_DATA_PATH}/temp_voice_${Date.now()}.mp3`;
        
        // 确保以 base64 格式写入文件
        fsm.writeFileSync(filePath, resData.audioBase64, 'base64');
        
        console.log('音频文件已写入:', filePath);

        // 如果之前的音频还在播放，先停掉
        if (this.innerAudioContext) {
          this.innerAudioContext.stop();
          // 重置音频上下文，部分机型/环境（如 Windows 微信）在覆盖同一个 InnerAudioContext 的 src 时容易出错
          this.innerAudioContext.src = '';
        }
        
        // ✨ 重要修复：使用 setTimeout 稍微延迟一下播放，确保文件完全落盘，并且微信内核读取文件不冲突
        setTimeout(() => {
          this.innerAudioContext.src = filePath;
          this.innerAudioContext.play();
        }, 100);

      } else {
        console.error('语音合成云函数返回异常:', resData);
      }
    } catch (err) {
      console.error('调用语音合成云函数失败:', err);
    }
  },

  // ✨ 从云数据库拉取历史对话回忆
  async loadChatHistoryFromCloud() {
    try {
      const db = wx.cloud.database();
      // 获取当前用户创建的对话，按时间降序排列，取最近的20条（可以根据需要调整）
      const res = await db.collection('chat_history')
        .orderBy('createTime', 'desc')
        .limit(20)
        .get();

      if (res.data && res.data.length > 0) {
        // 因为是从数据库按降序拿的（最新的在最前），我们把它反转一下，让旧的在上面，新的在下面
        const historyData = res.data.reverse().map(item => ({
          id: item._id, // 使用云数据库生成的 _id 作为唯一标识
          question: item.question,
          answer: item.answer,
          aiAvatar: item.aiAvatar || '🦊' // 兼容一下旧数据如果没有头像的情况
        }));

        this.setData({
          chatHistory: historyData
        });

        // 既然有回忆，就在草地上生成信封吧！最多显示3个哦
        const envelopeCount = Math.min(historyData.length, 3);
        const newEnvelopes = [];
        for (let i = 0; i < envelopeCount; i++) {
          newEnvelopes.push({
            id: `env_${Date.now()}_${i}`,
            rotation: Math.floor(Math.random() * 60) - 30,
            offsetX: Math.floor(Math.random() * 40) - 20,
            offsetY: Math.floor(Math.random() * 40) - 20
          });
        }
        
        this.setData({
          envelopes: newEnvelopes
        });

        console.log('✨ 成功唤醒了', historyData.length, '条回忆呢！');
      }
    } catch (err) {
      console.error('哎呀，拉取云端回忆失败了:', err);
    }
  },

  showMsg(msg){
    this.setData({
      latestAIMessage: {
        id: 0,
        role: 'ai',
        content: "",
        formattedContent: msg,
        loading: false
      }
    });
  },
  initRecord() {
    // 监听录音结束事件
    recorderManager.onStop(async (res) => {
      console.log("录音文件路径：", res.tempFilePath);
      this.showMsg('我正在努力听你说的话哦，稍等一下下...');

      try {
        const fileManager = wx.getFileSystemManager();
        
        // 1. 读取录音文件，转换为 Base64 格式
        const audioBase64 = fileManager.readFileSync(res.tempFilePath, 'base64');
        // 获取文件大小（字节数）
        const fileInfo = fileManager.statSync(res.tempFilePath);
        const dataLen = fileInfo.size;

        // 2. 调用我们刚刚写好的云函数 recognizeVoice
        const result = await wx.cloud.callFunction({
          name: 'recognizeVoice',
          data: {
            audioBase64: audioBase64,
            voiceFormat: 'mp3',
            dataLen: dataLen
          }
        });

        wx.hideLoading();
        
        const recognizeRes = result.result;
        if (recognizeRes && recognizeRes.code === 0 && recognizeRes.text) {
          // 语音识别成功！将文字发给 AI 助手进行对话
          console.log("识别出的文字：", recognizeRes.text);
          this.sendUserMessage(recognizeRes.text);
        } else {
          // 云函数报错或没有识别出文字
          console.error("云函数语音识别失败:", recognizeRes);
          this.showMsg('哎呀，我好像没听清，声音是不是太小了？能用信箱写给我吗？');
        }

      } catch (err) {
        wx.hideLoading();
        console.error('调用语音识别云函数出错:', err);
        this.showMsg('我的小耳朵好像有点累了，你先用信箱写字告诉我好不好呀？');
        wx.showToast({ title: '识别失败啦', icon: 'none' });
      } finally {
        this.setData({ isRecording: false });
      }
    });

    recorderManager.onError((res) => {
      console.error("录音错误：", res.errMsg);
      this.showMsg('麦克风好像坏啦');
      this.setData({ isRecording: false });
    });
  },

  startRecord() {
    // 请求录音权限并开始录音
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ isRecording: true });
        wx.vibrateShort({ type: 'medium' });

        const options = {
          duration: 30000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'mp3',
        };
        recorderManager.start(options);
      },
      fail: () => {
        this.showMsg('如果不让我听，我就不知道你在说什么啦，去设置里打开麦克风好吗？')
      }
    });
  },

  stopRecord() {
    if (!this.data.isRecording) return;
    this.setData({ isRecording: false });
    recorderManager.stop();
  },

  addEnvelope() {
    const { envelopes } = this.data;
    if (envelopes.length < 3) {
      // 随机旋转角度 -30 到 30 度
      const rotation = Math.floor(Math.random() * 60) - 30;
      // 随机偏移位置
      const offsetX = Math.floor(Math.random() * 40) - 20;
      const offsetY = Math.floor(Math.random() * 40) - 20;
      
      envelopes.push({
        id: Date.now(),
        rotation,
        offsetX,
        offsetY
      });
      this.setData({ envelopes });
    }
  },

  toggleTextInput() {
    this.setData({
      showTextInput: !this.data.showTextInput
    });
  },

  // 切换声音开关
  toggleSound() {
    const newStatus = !this.data.enableSound;
    this.setData({ enableSound: newStatus });
    if (newStatus) {
      wx.showToast({ title: '声音已开启', icon: 'none' });
    } else {
      wx.showToast({ title: '声音已关闭', icon: 'none' });
      // 如果声音正在播放，关闭开关时停止播放
      if (this.innerAudioContext) {
        this.innerAudioContext.stop();
      }
    }
  },

  // 切换历史记录弹窗
  toggleHistory() {
    if (this.data.envelopes.length === 0) return; // 如果没有信封就不弹
    this.setData({
      showHistory: !this.data.showHistory
    });
  },

  // ✨ 清空云端和本地的回忆记录
  clearHistory() {
    wx.showModal({
      title: '清空回忆',
      content: '真的要把我们所有的对话都扔掉吗？',
      confirmText: '扔掉吧',
      confirmColor: '#D32F2F',
      cancelText: '舍不得',
      success: async (res) => {
        if (res.confirm) {
          try {
            // 用 AI 气泡提示正在清理，取代冰冷的 loading
            this.showMsg('正在努力把旧信件扫进垃圾桶，稍等一下哦...');
            
            const db = wx.cloud.database();
            
            // 云开发小程序端不能直接批量删除所有记录，所以我们需要获取所有ID然后逐个删除，或者调用云函数。
            // 这里我们用一个简单的方法：遍历当前的本地 chatHistory 的 id 并在云端删除它们。
            const { chatHistory } = this.data;
            const deletePromises = chatHistory.map(item => 
              db.collection('chat_history').doc(item.id).remove()
            );
            
            await Promise.all(deletePromises);

            // 清空本地数据和草地上的信封
            this.setData({
              chatHistory: [],
              envelopes: [],
              showHistory: false // 关掉弹窗
            });

            // 清理完成后，用 AI 气泡温柔地通知
            this.showMsg('呼~ 回忆信箱已经打扫得干干净净啦！我们可以开始新的对话了哦！');
          } catch (err) {
            console.error('清空云端回忆失败:', err);
            // 清理失败时，用 AI 气泡提醒
            this.showMsg('哎呀，信箱盖子好像卡住了，垃圾没倒掉，等会儿再试一次好吗？');
          }
        }
      }
    });
  },

  preventD() {
    // 阻止冒泡
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  sendText() {
    const text = this.data.inputText.trim();
    if (!text) return;

    this.setData({
      inputText: '',
      showTextInput: false
    });

    this.sendUserMessage(text);
  },

  // 格式化文本为富文本节点，控制换行间距
  formatContentToRichText(text) {
    if (!text) return '';
    // 将多个连续换行替换为单个换行，然后按换行符分割成段落
    const paragraphs = text.replace(/\n+/g, '\n').split('\n').filter(p => p.trim() !== '');
    return paragraphs.map(p => `<div class="msg-paragraph">${p}</div>`).join('');
  },

  // ✨ 将对话保存到云数据库
  async saveChatToCloud(question, answer, aiAvatar, localMsgId) {
    try {
      const db = wx.cloud.database();
      // 小程序端直接调用 add 方法，微信会自动帮我们带上用户的 _openid
      const res = await db.collection('chat_history').add({
        data: {
          question: question,
          answer: answer,
          aiAvatar: aiAvatar,
          createTime: db.serverDate() // 记录创建的服务器时间
        }
      });
      
      console.log('✨ 历史对话保存到云端成功啦！云端ID:', res._id);
      
      // 拿到云端生成的 _id 后，更新我们本地的 chatHistory 数组
      // 这样用户刚刚聊完天，马上点清空，也能找到正确的云端 ID 啦！
      const { chatHistory } = this.data;
      const targetIndex = chatHistory.findIndex(item => item.id === localMsgId);
      if (targetIndex !== -1) {
        chatHistory[targetIndex].id = res._id;
        this.setData({ chatHistory });
      }

    } catch (err) {
      console.error('哎呀，保存对话到云端失败了:', err);
    }
  },

  async sendUserMessage(content) {
    const userMsgId = 'msg_' + Date.now();
    const aiMsgId = 'msg_' + (Date.now() + 1);

    // 清空当前回复内容，展示loading
    this.setData({
      latestAIMessage: { id: aiMsgId, role: 'ai', content: '', formattedContent: '', loading: true }
    });

    this.requestAI(content, aiMsgId);
  },

  async requestAI(userContent, aiMsgId) {
    try {
      // 构造系统提示词，让AI语气适合小朋友
      const systemPrompt = "你是专为小朋友设计的AI助手，会先判断问题类型：如果是日常闲聊或极简问题（如打招呼、简单计算），就用1-2句亲切的话自然回应；如果是需要解释的知识性问题，则按照三段式回答，先直接给出简洁答案（30字内），再用一句生活化的比喻或例子扩展（30字内），最后以“所以，[自动纠正错别字并简洁复述问题]，答案是[答案]哦~”收尾，全程语气温和可爱、可加emoji，禁止铺垫和专业术语。";

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ];

      const ai = wx.cloud.extend.AI;
      if (!ai) {
        throw new Error('未获取到云开发 AI 实例，请检查基础库版本或云开发配置');
      }

      const res = await ai.createModel("deepseek").streamText({
        data: {
          model: "deepseek-v3-0324",
          messages: messages
        }
      });

      let fullText = '';

      // 监听流式返回，微信云开发 AI streamText 返回的其实是 eventStream 
      for await (let event of res.eventStream) {
        if (event.data === "[DONE]") {
          break;
        }

        try {
          const data = JSON.parse(event.data);
          const text = data?.choices?.[0]?.delta?.content;

          if (text) {
            fullText += text;
            const formatted = this.formatContentToRichText(fullText);

            // 更新界面
            if (this.data.latestAIMessage.id === aiMsgId) {
              this.setData({
                latestAIMessage: {
                  id: aiMsgId,
                  role: 'ai',
                  content: fullText,
                  formattedContent: formatted,
                  loading: false
                }
              });
            }
          }
        } catch (e) {
          console.warn("解析AI数据片段失败:", event.data, e);
        }
      }

      // 如果没有收到任何内容
      if (!fullText) {
        throw new Error('AI返回内容为空');
      } else {
        // 随机分配一个小动物头像
        const animals = ['🦊', '🐿️', '🦉', '🐻', '🐰'];
        const randomAnimal = animals[Math.floor(Math.random() * animals.length)];

        // 对话成功，保存到历史记录
        const { chatHistory } = this.data;
        const finalFormatted = this.formatContentToRichText(fullText);
        const localMsgId = Date.now(); // 生成一个临时的本地 ID

        chatHistory.push({
          id: localMsgId,
          question: userContent,
          answer: finalFormatted, // 存入处理过换行间距的富文本
          aiAvatar: randomAnimal // 记录本次对话的 AI 头像
        });
        this.setData({ chatHistory });
        
        // 触发信封掉落动画
        this.addEnvelope();

        // 将这段珍贵的回忆偷偷塞进云数据库保存起来~
        // 并把刚刚生成的 localMsgId 传过去，方便云端返回真 ID 后替换它
        this.saveChatToCloud(userContent, finalFormatted, randomAnimal, localMsgId);

        // AI 朋友开始说话啦！✨
        this.playVoice(fullText);
      }
    } catch (err) {
      console.error('AI请求失败', err);

      if (this.data.latestAIMessage.id === aiMsgId) {
        this.setData({
          latestAIMessage: {
            id: aiMsgId,
            role: 'ai',
            content: '哎呀，我刚才开小差了，能再和我说一遍吗？',
            formattedContent: '<div class="msg-paragraph">哎呀，我刚才开小差了，能再和我说一遍吗？</div>',
            loading: false
          }
        });
      }
    }
  }
});