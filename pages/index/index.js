// 引入微信全局录音管理器
const recorderManager = wx.getRecorderManager();

Page({
  data: {
    statusBarHeight: 20,
    messages: [
      {
        id: 'init',
        role: 'ai',
        content: '你好呀！我是你的AI好朋友。你想知道为什么天空是蓝色的吗？快来告诉我吧！'
      }
    ],
    inputText: '',
    showTextInput: false,
    isRecording: false,
    scrollToMessage: '',
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20
    });
    
    this.initRecord();
  },

  initRecord() {
    // 监听录音结束事件
    recorderManager.onStop(async (res) => {
      console.log("录音文件路径：", res.tempFilePath);
      // 由于没有同声传译，这里可以先用一个可爱的话语提示，
      // 如果你需要后端或者云函数支持语音转文字，我们可以在这里通过 wx.uploadFile 把语音传上去哦！
      // 现在的替代方案是，模拟一个“听不懂但很可爱”的回复，或者你可以之后接入云开发的语音识别服务～
      wx.showLoading({ title: '正在听你说...' });
      
      try {
        // TODO: LO，这里之后可以接入腾讯云或你自己的语音识别接口。
        // 目前我先让它提示用户用文字输入，因为小程序原生没有自带免费的语音转文字 API 了呢。
        setTimeout(() => {
          wx.hideLoading();
          wx.showModal({
            title: '哎呀',
            content: '小码酱还在学习怎么听懂声音呢，你先用信箱写字告诉我好不好呀？',
            showCancel: false
          });
        }, 1000);
      } catch (err) {
        wx.hideLoading();
        wx.showToast({ title: '识别失败啦', icon: 'none' });
      }
    });

    recorderManager.onError((res) => {
      console.error("录音错误：", res.errMsg);
      wx.showToast({
        title: '麦克风好像坏啦',
        icon: 'none'
      });
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
        wx.showModal({
          title: '需要麦克风',
          content: '如果不让我听，我就不知道你在说什么啦，去设置里打开麦克风好吗？',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting();
            }
          }
        });
      }
    });
  },

  stopRecord() {
    if (!this.data.isRecording) return;
    this.setData({ isRecording: false });
    recorderManager.stop();
  },

  toggleTextInput() {
    this.setData({
      showTextInput: !this.data.showTextInput
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

  async sendUserMessage(content) {
    const userMsgId = 'msg_' + Date.now();
    const aiMsgId = 'msg_' + (Date.now() + 1);
    
    // 添加用户消息和AI等待消息
    const newMessages = [...this.data.messages, 
      { id: userMsgId, role: 'user', content },
      { id: aiMsgId, role: 'ai', content: '', loading: true }
    ];
    
    this.setData({
      messages: newMessages,
      scrollToMessage: aiMsgId
    });

    this.requestAI(content, aiMsgId);
  },

  async requestAI(userContent, aiMsgId) {
    try {
      // 构造系统提示词，让AI语气适合小朋友
      const systemPrompt = "你是一个面向小朋友的AI好朋友。你的语气应该亲切、可爱、充满好奇心。回复要健康、积极、简洁易懂，多用比喻，并且可以适当加上emoji。不要用复杂的专业词汇。尽量用简短的句子回答。";
      
      const history = this.data.messages
        .filter(m => m.content && !m.loading)
        .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
      
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
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
      
      // 如果直接返回了对象而不是流，兼容处理
      if (res && !res.stream && res.data && res.data.choices) {
         fullText = res.data.choices[0].message.content;
         const messagesCopy = [...this.data.messages];
         const aiMsgIndex = messagesCopy.findIndex(m => m.id === aiMsgId);
         if (aiMsgIndex > -1) {
           messagesCopy[aiMsgIndex].content = fullText;
           messagesCopy[aiMsgIndex].loading = false;
           this.setData({
             messages: messagesCopy,
             scrollToMessage: aiMsgId
           });
         }
      } else if (res && res.stream) {
        // 监听流式返回，微信云开发 AI streamText 可能返回的是 asyncIterator 或者基于事件的 stream 对象
        // 为了安全起见，检查是否真的是 async iterable
        if (typeof res.stream[Symbol.asyncIterator] === 'function') {
          for await (let event of res.stream) {
            if (event.data && event.data.choices && event.data.choices[0].delta && event.data.choices[0].delta.content) {
              fullText += event.data.choices[0].delta.content;
              
              // 更新界面
              const messagesCopy = [...this.data.messages];
              const aiMsgIndex = messagesCopy.findIndex(m => m.id === aiMsgId);
              if (aiMsgIndex > -1) {
                messagesCopy[aiMsgIndex].content = fullText;
                messagesCopy[aiMsgIndex].loading = false;
                this.setData({
                  messages: messagesCopy,
                  scrollToMessage: aiMsgId
                });
              }
            }
          }
        } else {
          // 如果不是标准的 asyncIterator，尝试用微信特有的事件监听机制
          res.stream.on('message', (event) => {
             if (event.data && event.data.choices && event.data.choices[0].delta && event.data.choices[0].delta.content) {
                fullText += event.data.choices[0].delta.content;
                const messagesCopy = [...this.data.messages];
                const aiMsgIndex = messagesCopy.findIndex(m => m.id === aiMsgId);
                if (aiMsgIndex > -1) {
                  messagesCopy[aiMsgIndex].content = fullText;
                  messagesCopy[aiMsgIndex].loading = false;
                  this.setData({
                    messages: messagesCopy,
                    scrollToMessage: aiMsgId
                  });
                }
             }
          });
          
          res.stream.on('error', (err) => {
             console.error("流事件报错", err);
          });
          
          // 等待流结束
          await new Promise((resolve) => {
             res.stream.on('finish', () => resolve());
          });
        }
      }
      
      // 如果没有收到任何内容
      if (!fullText) {
        throw new Error('AI返回内容为空');
      }
    } catch (err) {
      console.error('AI请求失败', err);
      const messagesCopy = [...this.data.messages];
      const aiMsgIndex = messagesCopy.findIndex(m => m.id === aiMsgId);
      if (aiMsgIndex > -1) {
        messagesCopy[aiMsgIndex].content = '哎呀，我刚才开小差了，能再和我说一遍吗？';
        messagesCopy[aiMsgIndex].loading = false;
        this.setData({
          messages: messagesCopy,
          scrollToMessage: aiMsgId
        });
      }
    }
  }
});