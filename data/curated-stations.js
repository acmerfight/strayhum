// Locations mark each station's city. The browser requests audio directly from the broadcaster or its streaming provider.
window.STATIONS = [
  {
    id: 'fip', name: 'FIP', city: 'Paris', country: 'France', genre: 'Jazz, soul & beyond', family: 'Eclectic',
    lat: 48.86, lon: 2.35, zone: 'Europe/Paris', frequency: '105.1 FM',
    urls: ['https://icecast.radiofrance.fr/fip-midfi.mp3', 'https://icecast.radiofrance.fr/fip-hifi.aac']
  },
  {
    id: 'kexp', name: 'KEXP', city: 'Seattle', country: 'United States', genre: 'Independent music', family: 'Rock & indie',
    lat: 47.61, lon: -122.33, zone: 'America/Los_Angeles', frequency: '90.3 FM',
    urls: ['https://kexp-mp3-128.streamguys1.com/kexp128.mp3', 'https://kexp.streamguys1.com/kexp160.aac']
  },
  {
    id: 'swissjazz', name: 'Radio Swiss Jazz', city: 'Basel', country: 'Switzerland', genre: 'Jazz, soul & blues', family: 'Jazz & soul',
    lat: 47.56, lon: 7.59, zone: 'Europe/Zurich', frequency: 'DIGITAL RADIO',
    urls: ['https://stream.srg-ssr.ch/m/rsj/mp3_128', 'https://stream.srg-ssr.ch/srgssr/rsj/aac/192']
  },
  {
    id: 'popasia', name: 'SBS PopAsia', city: 'Sydney', country: 'Australia', genre: 'K-pop, J-pop & C-pop', family: 'Pop',
    lat: -33.87, lon: 151.21, zone: 'Australia/Sydney', frequency: 'DIGITAL RADIO',
    urls: ['https://sbs-ice.streamguys1.com/sbs-popasia-sbs-web']
  },
  {
    id: 'nts', name: 'NTS Radio 1', city: 'London', country: 'United Kingdom', genre: 'Underground & experimental', family: 'Eclectic',
    lat: 51.55, lon: -0.07, zone: 'Europe/London', frequency: 'WEB RADIO',
    urls: ['https://stream-relay-geo.ntslive.net/stream']
  },
  {
    id: 'wqxr', name: 'WQXR', city: 'New York', country: 'United States', genre: 'Classical music', family: 'Classical',
    lat: 40.71, lon: -74.01, zone: 'America/New_York', frequency: '105.9 FM',
    urls: ['https://stream.wqxr.org/wqxr']
  },
  {
    id: 'oroko', name: 'Oroko Radio', city: 'Accra', country: 'Ghana', genre: 'Highlife, electronic & independent DJs', family: 'Eclectic',
    lat: 5.56, lon: -0.20, zone: 'Africa/Accra', frequency: 'WEB RADIO',
    urls: ['https://oroko-radio.radiocult.fm/stream']
  },
  {
    id: 'beijing', alias: '北京音乐广播', name: 'Beijing Music Radio', city: 'Beijing', country: 'China', genre: 'Mandopop & classics', family: 'Pop',
    lat: 39.90, lon: 116.41, zone: 'Asia/Shanghai', frequency: '97.4 FM',
    urls: ['https://lhttp.qtfm.cn/live/332/64k.mp3']
  },
  {
    id: 'nfrs', name: 'SOUND UP NFRS', city: 'Osaka', country: 'Japan', genre: 'Independent music & DJs', family: 'Eclectic',
    lat: 34.64, lon: 135.50, zone: 'Asia/Tokyo', frequency: 'WEB RADIO',
    urls: ['https://stream2.rcast.net/70945']
  },
  {
    id: 'mix', name: 'Rádio Mix', city: 'São Paulo', country: 'Brazil', genre: 'Brazilian & international hits', family: 'Pop',
    lat: -23.55, lon: -46.63, zone: 'America/Sao_Paulo', frequency: '106.3 FM',
    urls: ['https://playerservices.streamtheworld.com/api/livestream-redirect/MIXFM_SAOPAULOAAC.aac']
  },
  {
    id: 'hot', name: 'HOT 102.7', city: 'Johannesburg', country: 'South Africa', genre: 'Classic hits', family: 'Pop',
    lat: -26.20, lon: 28.05, zone: 'Africa/Johannesburg', frequency: '102.7 FM',
    urls: ['https://edge.iono.fm/xice/57_high.aac']
  },
  {
    id: 'rockpop', name: 'Rock & Pop', city: 'Buenos Aires', country: 'Argentina', genre: 'Argentine & international rock', family: 'Rock & indie',
    lat: -34.60, lon: -58.38, zone: 'America/Argentina/Buenos_Aires', frequency: '95.9 FM',
    urls: ['https://playerservices.streamtheworld.com/api/livestream-redirect/ROCKANDPOPAAC.aac']
  },
  {
    id: 'ibero', name: 'IBERO.2', city: 'Mexico City', country: 'Mexico', genre: 'Independent & alternative', family: 'Rock & indie',
    lat: 19.43, lon: -99.13, zone: 'America/Mexico_City', frequency: '90.9 HD2',
    urls: ['https://shaincast.caster.fm:20866/listen.mp3']
  },
  {
    id: 'sunshine', name: 'SUNSHINE LIVE', city: 'Mannheim', country: 'Germany', genre: 'Melodic techno', family: 'Electronic',
    lat: 49.49, lon: 8.46, zone: 'Europe/Berlin', frequency: 'WEB RADIO',
    urls: ['https://stream.sunshine-live.de/melodic-techno/mp3-128/stream.sunshine-live.de/']
  },
  {
    id: 'rhythm', name: 'Rhythm 93.7', city: 'Lagos', country: 'Nigeria', genre: 'R&B, hip-hop & Afrobeats', family: 'Pop',
    lat: 6.43, lon: 3.42, zone: 'Africa/Lagos', frequency: '93.7 FM',
    urls: ['https://rhythmfmlagos-atunwadigital.streamguys1.com/rhythmfmlagos']
  },
  {
    id: 'mazaj', name: 'Mazaj FM', city: 'Amman', country: 'Jordan', genre: 'Arabic pop & golden hits', family: 'Pop',
    lat: 31.95, lon: 35.93, zone: 'Asia/Amman', frequency: '95.3 FM',
    urls: ['https://mazajfm.ice.infomaniak.ch/mazajfm-192.mp3']
  },
  {
    id: 'rnz', name: 'RNZ Concert', city: 'Wellington', country: 'New Zealand', genre: 'Classical & concert music', family: 'Classical',
    lat: -41.29, lon: 174.78, zone: 'Pacific/Auckland', frequency: 'FM RADIO',
    urls: ['https://stream-ice.radionz.co.nz/Concert_aac128', 'https://stream-ice.radionz.co.nz/concert.mp3']
  },
  {
    id: 'goodhope', name: 'Good Hope FM', city: 'Cape Town', country: 'South Africa', genre: 'R&B, dance & hip-hop', family: 'Pop',
    lat: -33.92, lon: 18.42, zone: 'Africa/Johannesburg', frequency: '95.8 FM',
    urls: ['https://playerservices.streamtheworld.com/api/livestream-redirect/GOODHOPEFMAAC.aac']
  },
  {
    id: 'yes933', name: 'YES 933', city: 'Singapore', country: 'Singapore', genre: 'Mandopop hits', family: 'Pop',
    lat: 1.35, lon: 103.82, zone: 'Asia/Singapore', frequency: '93.3 FM',
    urls: ['https://playerservices.streamtheworld.com/api/livestream-redirect/YES933_PREM.aac']
  },
  {"id": "cn-274", "name": "Dynamic 101", "city": "Shanghai", "country": "China", "alias": "上海动感101", "genre": "Mandopop & chart hits", "family": "Pop", "lat": 31.23, "lon": 121.47, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp.qingting.fm/live/274/64k.mp3"]},
  {"id": "cn-4963", "name": "Nanjing Music Radio", "city": "Nanjing", "country": "China", "alias": "南京音乐广播", "genre": "Chinese music & hits", "family": "Pop", "lat": 32.06, "lon": 118.8, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp-hw.qtfm.cn/live/4963/64k.mp3"]},
  {"id": "cn-1739", "name": "Xiamen Music Radio", "city": "Xiamen", "country": "China", "alias": "厦门音乐广播", "genre": "Chinese music & hits", "family": "Pop", "lat": 24.48, "lon": 118.09, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp.qtfm.cn/live/1739/64k.mp3"]},
  {"id": "cn-1110", "name": "Sichuan Music Radio", "city": "Chengdu", "country": "China", "alias": "四川音乐广播", "genre": "Chinese music & hits", "family": "Pop", "lat": 30.57, "lon": 104.07, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp.qtfm.cn/live/1110/64k.mp3"]},
  {"id": "cn-1929", "name": "Yunnan Music Radio", "city": "Kunming", "country": "China", "alias": "云南音乐广播", "genre": "Chinese music & hits", "family": "Pop", "lat": 25.04, "lon": 102.71, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp.qtfm.cn/live/1929/64k.mp3"]},
  {"id": "cn-1084", "name": "Dalian Music Radio", "city": "Dalian", "country": "China", "alias": "大连音乐广播", "genre": "Chinese music & hits", "family": "Pop", "lat": 38.91, "lon": 121.61, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp.qingting.fm/live/1084/64k.mp3"]},
  {"id": "cn-1886", "name": "Inner Mongolia Music Radio", "city": "Hohhot", "country": "China", "alias": "内蒙古音乐之声", "genre": "Music variety", "family": "Eclectic", "lat": 40.84, "lon": 111.75, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp-hw.qtfm.cn/live/1886/64k.mp3"]},
  {"id": "cn-1671", "name": "Jinan Music Radio", "city": "Jinan", "country": "China", "alias": "济南音乐广播", "genre": "Chinese music & hits", "family": "Pop", "lat": 36.65, "lon": 117.12, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp.qtfm.cn/live/1671/64k.mp3"]},
  {"id": "cn-1149", "name": "Wenzhou Music Radio", "city": "Wenzhou", "country": "China", "alias": "温州音乐之声", "genre": "Chinese music & hits", "family": "Pop", "lat": 28, "lon": 120.7, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp.qtfm.cn/live/1149/64k.mp3"]},
  {"id": "cn-1296", "name": "Hubei Classic Hits", "city": "Wuhan", "country": "China", "alias": "湖北经典音乐广播", "genre": "Classic hits", "family": "Oldies & decades", "lat": 30.59, "lon": 114.31, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp.qtfm.cn/live/1296/64k.mp3"]},
  {"id": "cn-4979", "name": "Mango Music Radio", "city": "Changsha", "country": "China", "alias": "湖南音乐之声 芒果音乐台", "genre": "Mandopop & chart hits", "family": "Pop", "lat": 28.23, "lon": 112.94, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp-hw.qtfm.cn/live/4979/64k.mp3"]},
  {"id": "cn-1683", "name": "Yantai Music Radio", "city": "Yantai", "country": "China", "alias": "烟台音乐广播", "genre": "Chinese music & hits", "family": "Pop", "lat": 37.46, "lon": 121.45, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp.qtfm.cn/live/1683/64k.mp3"]},
  {"id": "cn-1612", "name": "Xi’an Music Radio", "city": "Xi’an", "country": "China", "alias": "西安音乐广播", "genre": "Chinese music & hits", "family": "Pop", "lat": 34.34, "lon": 108.94, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp-hw.qtfm.cn/live/1612/64k.mp3"]},
  {"id": "cn-20067", "name": "Guizhou Music Radio", "city": "Guiyang", "country": "China", "alias": "贵州音乐广播", "genre": "Chinese music & hits", "family": "Pop", "lat": 26.65, "lon": 106.63, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp.qtfm.cn/live/20067/64k.mp3"]},
  {"id": "cn-1101", "name": "Liaoning Music Radio", "city": "Shenyang", "country": "China", "alias": "辽宁音乐广播", "genre": "Chinese music & hits", "family": "Pop", "lat": 41.81, "lon": 123.43, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp.qtfm.cn/live/1101/64k.mp3?app"]},
  {"id": "cn-4921", "name": "Zhengzhou Music Radio", "city": "Zhengzhou", "country": "China", "alias": "郑州音乐广播", "genre": "Chinese music & hits", "family": "Pop", "lat": 34.75, "lon": 113.62, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp.qtfm.cn/live/4921/64k.mp3"]},
  {"id": "cn-4969", "name": "Heilongjiang Music Radio", "city": "Harbin", "country": "China", "alias": "黑龙江音乐广播", "genre": "Chinese music & hits", "family": "Pop", "lat": 45.8, "lon": 126.53, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp.qtfm.cn/live/4969/64k.mp3"]},
  {"id": "cn-20010", "name": "Haikou Music Radio", "city": "Haikou", "country": "China", "alias": "海口音乐广播", "genre": "Chinese music & hits", "family": "Pop", "lat": 20.04, "lon": 110.2, "zone": "Asia/Shanghai", "frequency": "WEB RADIO", "urls": ["https://lhttp-hw.qtfm.cn/live/20010/64k.mp3"]}
];
