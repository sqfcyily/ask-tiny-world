// 云函数入口文件: index.js
const cloud = require('wx-server-sdk');
const tencentcloud = require("tencentcloud-sdk-nodejs-asr");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 提取 Client 构造，避免每次函数调用都重新初始化，极致优化冷启动
const AsrClient = tencentcloud.asr.v20190614.Client;

/**
 * 云函数主入口
 * 接收小程序端传来的 base64 音频数据，调用腾讯云一句话识别 ASR 接口，返回识别出的文本。
 *
 * @param {Object} event - 包含小程序端传来的参数
 * @param {string} event.audioBase64 - 音频数据的 Base64 编码 (注意：不包含 data:audio/mp3;base64, 前缀)
 * @param {string} event.voiceFormat - 音频格式，默认 "mp3"
 * @param {number} event.dataLen - 音频原始数据的字节长度 (Base64编码前的长度)
 * @param {Object} context - 运行上下文
 */
exports.main = async (event, context) => {
  const { audioBase64, voiceFormat = 'mp3', dataLen } = event;

  if (!audioBase64 || !dataLen) {
    return { code: -1, message: '缺少必要的音频数据或长度参数' };
  }

  // 从云函数的环境变量中读取密钥，绝对安全！
  const secretId = process.env.ASR_CLOUD_SECRET_ID;
  const secretKey = process.env.ASR_CLOUD_SECRET_KEY;

  if (!secretId || !secretKey) {
    return { code: -2, message: '云端未配置 ASR_CLOUD_SECRET_ID 或 ASR_CLOUD_SECRET_KEY 环境变量' };
  }

  const clientConfig = {
    credential: {
      secretId: secretId,
      secretKey: secretKey,
    },
    region: "ap-shanghai", // 默认华东节点，如果你买的资源在别的地域，请修改这里
    profile: {
      httpProfile: {
        endpoint: "asr.tencentcloudapi.com",
      },
    },
  };

  const client = new AsrClient(clientConfig);

  // 构建 ASR 请求参数
  const params = {
    "ProjectId": 0,
    "SubServiceType": 2, // 一句话识别
    "EngSerViceType": "16k_zh", // 引擎类型，16k中文
    "SourceType": 1, // 1表示语音数据
    "VoiceFormat": voiceFormat,
    "UsrAudioKey": `lo-voice-${Date.now()}-${Math.floor(Math.random() * 1000)}`, // 唯一请求 ID
    "Data": audioBase64,
    "DataLen": dataLen
  };

  try {
    // 发起 ASR 请求
    const asrResponse = await client.SentenceRecognition(params);
    
    // 返回给小程序端的成功响应结构
    return { 
      code: 0, 
      text: asrResponse.Result, // 识别出的中文字符串
      raw: asrResponse 
    };
    
  } catch (error) {
    console.error("ASR_ERROR:", error);
    // 返回错误兜底响应
    return { 
      code: -3, 
      message: error.message || '语音识别调用失败',
      rawError: error
    };
  }
};
