App({
  globalData: {
    openid: null // 保存用户的 openid
  },
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      // 初始化云开发环境
      wx.cloud.init({
        env: '',
        traceUser: true,
      })
    }

    // 尝试静默登录获取 openid，用于未来保存用户数据
    this.loginAndGetOpenid();
  },

  loginAndGetOpenid() {
    // 调用微信登录接口
    wx.login({
      success: (res) => {
        if (res.code) {
          console.log('登录成功，获取到 code:', res.code);

          // 如果你之后配置了云函数，可以解开下面的注释来静默获取用户的 openid：
          wx.cloud.callFunction({
            name: 'login', // 假设你有一个名为 login 的云函数
            success: (cloudRes) => {
              this.globalData.openid = cloudRes.result.openid;
              console.log('静默获取 openid 成功:', this.globalData.openid);
            },
            fail: (err) => {
              console.error('获取 openid 失败:', err);
            }
          });
        } else {
          console.log('登录失败！' + res.errMsg);
        }
      }
    });
  }
})