// Coordinates mark the station's city. Audio is served directly by its stream provider.
window.STATIONS = [
  {
    id: 'fip', name: 'FIP', city: '巴黎', cityEn: 'Paris', country: '法国', genre: '环球音乐',
    lat: 48.86, lon: 2.35, frequency: '105.1 FM',
    urls: ['https://icecast.radiofrance.fr/fip-midfi.mp3', 'https://icecast.radiofrance.fr/fip-hifi.aac']
  },
  {
    id: 'beijing', name: '北京新闻广播', city: '北京', cityEn: 'Beijing', country: '中国', genre: '新闻资讯',
    lat: 39.90, lon: 116.41, frequency: '94.5 FM',
    urls: ['https://lhttp.qtfm.cn/live/339/64k.mp3']
  },
  {
    id: 'kexp', name: 'KEXP', city: '西雅图', cityEn: 'Seattle', country: '美国', genre: '独立音乐',
    lat: 47.61, lon: -122.33, frequency: '90.3 FM',
    urls: ['https://kexp-mp3-128.streamguys1.com/kexp128.mp3', 'https://kexp.streamguys1.com/kexp160.aac']
  },
  {
    id: 'nts', name: 'NTS Radio 1', city: '伦敦', cityEn: 'London', country: '英国', genre: '实验音乐',
    lat: 51.55, lon: -0.07, frequency: 'WEB RADIO',
    urls: ['https://stream-relay-geo.ntslive.net/stream']
  },
  {
    id: 'nfrs', name: 'SOUND UP NFRS', city: '大阪', cityEn: 'Osaka', country: '日本', genre: '独立音乐',
    lat: 34.69, lon: 135.50, frequency: 'WEB RADIO',
    urls: ['https://stream2.rcast.net/70945']
  },
  {
    id: 'popasia', name: 'SBS PopAsia', city: '悉尼', cityEn: 'Sydney', country: '澳大利亚', genre: '亚洲流行',
    lat: -33.87, lon: 151.21, frequency: 'DIGITAL RADIO',
    urls: ['https://sbs-ice.streamguys1.com/sbs-popasia-sbs-web']
  },
  {
    id: 'wnyc', name: 'WNYC', city: '纽约', cityEn: 'New York', country: '美国', genre: '新闻谈话',
    lat: 40.71, lon: -74.01, frequency: '93.9 FM',
    urls: ['https://fm939.wnyc.org/wnycfm']
  },
  {
    id: 'mix', name: 'Rádio Mix', city: '圣保罗', cityEn: 'São Paulo', country: '巴西', genre: '流行音乐',
    lat: -23.55, lon: -46.63, frequency: '106.3 FM',
    urls: ['https://playerservices.streamtheworld.com/api/livestream-redirect/MIXFM_SAOPAULOAAC.aac']
  },
  {
    id: 'hot', name: 'HOT 102.7', city: '约翰内斯堡', cityEn: 'Johannesburg', country: '南非', genre: '经典金曲',
    lat: -26.20, lon: 28.05, frequency: '102.7 FM',
    urls: ['https://edge.iono.fm/xice/57_high.aac']
  },
  {
    id: 'rockpop', name: 'Rock & Pop', city: '布宜诺斯艾利斯', cityEn: 'Buenos Aires', country: '阿根廷', genre: '摇滚音乐',
    lat: -34.60, lon: -58.38, frequency: '95.9 FM',
    urls: ['https://playerservices.streamtheworld.com/api/livestream-redirect/ROCKANDPOPAAC.aac']
  },
  {
    id: 'cultura', name: 'Radio Educación', city: '墨西哥城', cityEn: 'Mexico City', country: '墨西哥', genre: '文化艺术',
    lat: 19.43, lon: -99.13, frequency: '96.5 FM',
    urls: ['https://s2.mexside.net/8174/stream']
  },
  {
    id: 'swissjazz', name: 'Radio Swiss Jazz', city: '巴塞尔', cityEn: 'Basel', country: '瑞士', genre: '爵士乐',
    lat: 47.56, lon: 7.59, frequency: 'DIGITAL RADIO',
    urls: ['https://stream.srg-ssr.ch/m/rsj/mp3_128', 'https://stream.srg-ssr.ch/srgssr/rsj/aac/192']
  }
];
