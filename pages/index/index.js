// 引入微信全局录音管理器
const recorderManager = wx.getRecorderManager();

Page({
  data: {
    statusBarHeight: 20,
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

  // 切换历史记录弹窗
  toggleHistory() {
    if (this.data.envelopes.length === 0) return; // 如果没有信封就不弹
    this.setData({
      showHistory: !this.data.showHistory
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
        chatHistory.push({
          id: Date.now(),
          question: userContent,
          answer: finalFormatted, // 存入处理过换行间距的富文本
          aiAvatar: randomAnimal // 记录本次对话的 AI 头像
        });
        this.setData({ chatHistory });
        
        // 触发信封掉落动画
        this.addEnvelope();
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