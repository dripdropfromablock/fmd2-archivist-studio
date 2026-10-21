export type SourceId = string;

export interface FmdSourceModule {
  id: SourceId;
  name: string;
  domain: string;
  luaModule: string;
  template: 'Madara' | 'MangaStream' | 'WPComics' | 'FoolSlide' | 'FlatManga' | 'Core' | 'Custom';
  language:
    | 'EN'
    | 'Multi'
    | 'JA'
    | 'KO'
    | 'ZH'
    | 'ES'
    | 'PT'
    | 'FR'
    | 'ID'
    | 'RU'
    | 'VI'
    | 'AR'
    | 'DE'
    | 'IT';
  category:
    | 'Manga & Manhwa'
    | 'Webtoon & Manhua'
    | 'Aggregator'
    | 'Raw & Official'
    | 'International';
  supportsDirectLink: boolean;
  supportsTitleSearch: boolean;
  avgResponseMs: number;
  enabledByDefault: boolean;
}

/**
 * The 5 verified live FMD2 sources enabled by default.
 * Additional real FMD2 repository Lua connectors are disabled by default
 * and can be enabled by the user in Settings.
 */
export const DEFAULT_ENABLED_SOURCE_IDS: SourceId[] = [
  'weebcentral',
  'asurascans',
  'mangadex',
  'likemanga',
  'mangakatana',
];

interface RawSourceSeed {
  id: string;
  name: string;
  domain: string;
  lua: string;
  template: FmdSourceModule['template'];
  lang: FmdSourceModule['language'];
  cat: FmdSourceModule['category'];
  ping: number;
  defaultOn?: boolean;
}

const EXPLICIT_SEEDS: RawSourceSeed[] = [
  // === 5 DEFAULT ENABLED LIVE SOURCES ===
  {
    id: 'weebcentral',
    name: 'WeebCentral',
    domain: 'weebcentral.com',
    lua: 'lua/modules/WeebCentral.lua',
    template: 'Custom',
    lang: 'EN',
    cat: 'Manga & Manhwa',
    ping: 112,
    defaultOn: true,
  },
  {
    id: 'asurascans',
    name: 'Asura Scans',
    domain: 'asurascans.com',
    lua: 'lua/modules/AsuraScans.lua',
    template: 'MangaStream',
    lang: 'EN',
    cat: 'Webtoon & Manhua',
    ping: 124,
    defaultOn: true,
  },
  {
    id: 'mangadex',
    name: 'MangaDex',
    domain: 'mangadex.org',
    lua: 'lua/modules/MangaDex.lua',
    template: 'Core',
    lang: 'Multi',
    cat: 'Aggregator',
    ping: 118,
    defaultOn: true,
  },
  {
    id: 'likemanga',
    name: 'LikeManga.ink',
    domain: 'likemanga.ink',
    lua: 'lua/modules/LikeManga.lua',
    template: 'Madara',
    lang: 'EN',
    cat: 'Manga & Manhwa',
    ping: 128,
    defaultOn: true,
  },
  {
    id: 'mangakatana',
    name: 'MangaKatana',
    domain: 'mangakatana.com',
    lua: 'lua/modules/MangaKatana.lua',
    template: 'Custom',
    lang: 'EN',
    cat: 'Manga & Manhwa',
    ping: 136,
    defaultOn: true,
  },

  // === REAL FMD2 REPOSITORY LUA MODULES (DISABLED BY DEFAULT) ===
  { id: 'comick', name: 'ComicK', domain: 'comick.io', lua: 'lua/modules/ComicK.lua', template: 'Core', lang: 'Multi', cat: 'Aggregator', ping: 115 },
  { id: 'mangasee', name: 'MangaSee123', domain: 'mangasee123.com', lua: 'lua/modules/MangaSee.lua', template: 'Custom', lang: 'EN', cat: 'Manga & Manhwa', ping: 121 },
  { id: 'mangalife', name: 'MangaLife', domain: 'manga4life.com', lua: 'lua/modules/MangaLife.lua', template: 'Custom', lang: 'EN', cat: 'Manga & Manhwa', ping: 126 },
  { id: 'flamescans', name: 'Flame Comics', domain: 'flamecomics.xyz', lua: 'lua/modules/FlameScans.lua', template: 'MangaStream', lang: 'EN', cat: 'Webtoon & Manhua', ping: 132 },
  { id: 'reaperscans', name: 'Reaper Scans', domain: 'reaperscans.com', lua: 'lua/modules/ReaperScans.lua', template: 'Custom', lang: 'EN', cat: 'Webtoon & Manhua', ping: 139 },
  { id: 'manganato', name: 'Manganato', domain: 'manganato.com', lua: 'lua/modules/Manganato.lua', template: 'FlatManga', lang: 'EN', cat: 'Aggregator', ping: 142 },
  { id: 'mangakakalot', name: 'MangaKakalot', domain: 'mangakakalot.com', lua: 'lua/modules/MangaKakalot.lua', template: 'FlatManga', lang: 'EN', cat: 'Aggregator', ping: 145 },
  { id: 'mangabat', name: 'MangaBat', domain: 'readmangabat.com', lua: 'lua/modules/MangaBat.lua', template: 'FlatManga', lang: 'EN', cat: 'Aggregator', ping: 148 },
  { id: 'bato', name: 'Bato.to', domain: 'bato.to', lua: 'lua/modules/Batoto.lua', template: 'Core', lang: 'Multi', cat: 'Aggregator', ping: 129 },
  { id: 'mangapark', name: 'MangaPark', domain: 'mangapark.net', lua: 'lua/modules/MangaPark.lua', template: 'Core', lang: 'Multi', cat: 'Aggregator', ping: 134 },
  { id: 'mangabuddy', name: 'MangaBuddy', domain: 'mangabuddy.com', lua: 'lua/modules/MangaBuddy.lua', template: 'Madara', lang: 'EN', cat: 'Manga & Manhwa', ping: 137 },
  { id: 'mangareaderto', name: 'MangaReader.to', domain: 'mangareader.to', lua: 'lua/modules/MangaReaderTo.lua', template: 'Custom', lang: 'EN', cat: 'Aggregator', ping: 125 },
  { id: 'mangafire', name: 'MangaFire', domain: 'mangafire.to', lua: 'lua/modules/MangaFire.lua', template: 'Custom', lang: 'Multi', cat: 'Aggregator', ping: 119 },
  { id: 'toonily', name: 'Toonily', domain: 'toonily.com', lua: 'lua/modules/Toonily.lua', template: 'Madara', lang: 'EN', cat: 'Webtoon & Manhua', ping: 144 },
  { id: 'toonilynet', name: 'Toonily.net', domain: 'toonily.net', lua: 'lua/modules/ToonilyNet.lua', template: 'Madara', lang: 'EN', cat: 'Webtoon & Manhua', ping: 149 },
  { id: 'webtoons', name: 'LINE Webtoon', domain: 'webtoons.com', lua: 'lua/modules/Webtoons.lua', template: 'Core', lang: 'Multi', cat: 'Raw & Official', ping: 114 },
  { id: 'tapas', name: 'Tapas.io', domain: 'tapas.io', lua: 'lua/modules/Tapas.lua', template: 'Core', lang: 'EN', cat: 'Raw & Official', ping: 122 },
  { id: 'tappytoon', name: 'Tappytoon', domain: 'tappytoon.com', lua: 'lua/modules/Tappytoon.lua', template: 'Custom', lang: 'EN', cat: 'Raw & Official', ping: 131 },
  { id: 'mangaplus', name: 'MANGA Plus Shueisha', domain: 'mangaplus.shueisha.co.jp', lua: 'lua/modules/MangaPlus.lua', template: 'Core', lang: 'Multi', cat: 'Raw & Official', ping: 108 },
  { id: 'vizshonenjump', name: 'VIZ Shonen Jump', domain: 'viz.com', lua: 'lua/modules/VizShonenJump.lua', template: 'Custom', lang: 'EN', cat: 'Raw & Official', ping: 116 },
  { id: 'kakaopage', name: 'KakaoPage', domain: 'page.kakao.com', lua: 'lua/modules/KakaoPage.lua', template: 'Custom', lang: 'KO', cat: 'Raw & Official', ping: 162 },
  { id: 'naverwebtoon', name: 'Naver Webtoon', domain: 'comic.naver.com', lua: 'lua/modules/NaverWebtoon.lua', template: 'Core', lang: 'KO', cat: 'Raw & Official', ping: 158 },
  { id: 'ridibooks', name: 'RidiBooks', domain: 'ridibooks.com', lua: 'lua/modules/RidiBooks.lua', template: 'Custom', lang: 'KO', cat: 'Raw & Official', ping: 165 },
  { id: 'lezhin', name: 'Lezhin Comics', domain: 'lezhinus.com', lua: 'lua/modules/Lezhin.lua', template: 'Custom', lang: 'Multi', cat: 'Raw & Official', ping: 143 },
  { id: 'bilibili', name: 'Bilibili Comics', domain: 'bilibilicomics.com', lua: 'lua/modules/BilibiliComics.lua', template: 'Core', lang: 'Multi', cat: 'Raw & Official', ping: 151 },
  { id: 'kuaikanmanhua', name: 'Kuaikan Manhua', domain: 'kuaikanmanhua.com', lua: 'lua/modules/KuaikanManhua.lua', template: 'Custom', lang: 'ZH', cat: 'Raw & Official', ping: 174 },
  { id: 'acqq', name: 'Tencent AC.QQ', domain: 'ac.qq.com', lua: 'lua/modules/AcQQ.lua', template: 'Custom', lang: 'ZH', cat: 'Raw & Official', ping: 178 },
  { id: 'dmzj', name: 'DMZJ Manhua', domain: 'manhua.dmzj.com', lua: 'lua/modules/DMZJ.lua', template: 'Core', lang: 'ZH', cat: 'Webtoon & Manhua', ping: 169 },
  { id: 'baozimh', name: 'Baozi Manhua', domain: 'baozimh.com', lua: 'lua/modules/BaoziMH.lua', template: 'Custom', lang: 'ZH', cat: 'Webtoon & Manhua', ping: 164 },
  { id: 'colamanga', name: 'ColaManga', domain: 'colamanga.com', lua: 'lua/modules/ColaManga.lua', template: 'Custom', lang: 'ZH', cat: 'Webtoon & Manhua', ping: 171 },
  { id: 'manhuagui', name: 'ManHuaGui', domain: 'manhuagui.com', lua: 'lua/modules/ManHuaGui.lua', template: 'Core', lang: 'ZH', cat: 'Webtoon & Manhua', ping: 167 },
  { id: 'copymanga', name: 'CopyManga', domain: 'copymanga.site', lua: 'lua/modules/CopyManga.lua', template: 'Custom', lang: 'ZH', cat: 'Aggregator', ping: 161 },
  { id: 'senkuro', name: 'Senkuro', domain: 'senkuro.com', lua: 'lua/modules/Senkuro.lua', template: 'Custom', lang: 'RU', cat: 'International', ping: 154 },
  { id: 'mangalib', name: 'MangaLib', domain: 'mangalib.me', lua: 'lua/modules/MangaLib.lua', template: 'Core', lang: 'RU', cat: 'International', ping: 147 },
  { id: 'readmanga', name: 'ReadManga.live', domain: 'readmanga.live', lua: 'lua/modules/ReadManga.lua', template: 'Core', lang: 'RU', cat: 'International', ping: 159 },
  { id: 'mintmanga', name: 'MintManga', domain: 'mintmanga.live', lua: 'lua/modules/MintManga.lua', template: 'Core', lang: 'RU', cat: 'International', ping: 163 },
  { id: 'desu', name: 'Desu.me', domain: 'desu.me', lua: 'lua/modules/Desu.lua', template: 'Custom', lang: 'RU', cat: 'International', ping: 168 },
  { id: 'remanga', name: 'ReManga', domain: 'remanga.org', lua: 'lua/modules/ReManga.lua', template: 'Custom', lang: 'RU', cat: 'International', ping: 152 },
  { id: 'tumangaonline', name: 'TuMangaOnline (ZonaTMO)', domain: 'zonatmo.com', lua: 'lua/modules/TuMangaOnline.lua', template: 'Core', lang: 'ES', cat: 'International', ping: 141 },
  { id: 'lectortmo', name: 'LectorTMO', domain: 'lectortmo.com', lua: 'lua/modules/LectorTMO.lua', template: 'Core', lang: 'ES', cat: 'International', ping: 146 },
  { id: 'olympusscanlation', name: 'Olympus Scanlation', domain: 'olympusv2.gg', lua: 'lua/modules/OlympusScanlation.lua', template: 'MangaStream', lang: 'ES', cat: 'International', ping: 153 },
  { id: 'inmanga', name: 'InManga', domain: 'inmanga.com', lua: 'lua/modules/InManga.lua', template: 'Custom', lang: 'ES', cat: 'International', ping: 157 },
  { id: 'submanga', name: 'SubManga', domain: 'submanga.io', lua: 'lua/modules/SubManga.lua', template: 'FlatManga', lang: 'ES', cat: 'International', ping: 166 },
  { id: 'mangalivre', name: 'MangaLivre', domain: 'mangalivre.net', lua: 'lua/modules/MangaLivre.lua', template: 'Core', lang: 'PT', cat: 'International', ping: 150 },
  { id: 'unionmangas', name: 'UnionMangas', domain: 'unionmangas.top', lua: 'lua/modules/UnionMangas.lua', template: 'FlatManga', lang: 'PT', cat: 'International', ping: 156 },
  { id: 'lermanga', name: 'LerManga', domain: 'lermanga.org', lua: 'lua/modules/LerManga.lua', template: 'Madara', lang: 'PT', cat: 'International', ping: 160 },
  { id: 'neoxscans', name: 'Neox Scanlator', domain: 'neoxscans.net', lua: 'lua/modules/NeoxScans.lua', template: 'Madara', lang: 'PT', cat: 'International', ping: 164 },
  { id: 'goldenmangas', name: 'Golden Mangás', domain: 'goldenmangas.top', lua: 'lua/modules/GoldenMangas.lua', template: 'Custom', lang: 'PT', cat: 'International', ping: 170 },
  { id: 'japscan', name: 'JapScan', domain: 'japscan.lol', lua: 'lua/modules/JapScan.lua', template: 'Core', lang: 'FR', cat: 'International', ping: 138 },
  { id: 'scantrad', name: 'Scantrad France', domain: 'scantrad.net', lua: 'lua/modules/Scantrad.lua', template: 'Custom', lang: 'FR', cat: 'International', ping: 143 },
  { id: 'mangascantrad', name: 'Manga-Scantrad', domain: 'manga-scantrad.io', lua: 'lua/modules/MangaScantrad.lua', template: 'Madara', lang: 'FR', cat: 'International', ping: 149 },
  { id: 'phenixscans', name: 'Phenix Scans', domain: 'phenixscans.fr', lua: 'lua/modules/PhenixScans.lua', template: 'MangaStream', lang: 'FR', cat: 'International', ping: 155 },
  { id: 'fmteam', name: 'FMTeam', domain: 'fmteam.fr', lua: 'lua/modules/FMTeam.lua', template: 'FoolSlide', lang: 'FR', cat: 'International', ping: 161 },
  { id: 'komikindo', name: 'KomikIndo', domain: 'komikindo.tv', lua: 'lua/modules/KomikIndo.lua', template: 'MangaStream', lang: 'ID', cat: 'International', ping: 145 },
  { id: 'komikcast', name: 'KomikCast', domain: 'komikcast.lol', lua: 'lua/modules/KomikCast.lua', template: 'MangaStream', lang: 'ID', cat: 'International', ping: 148 },
  { id: 'komiku', name: 'Komiku.id', domain: 'komiku.id', lua: 'lua/modules/Komiku.lua', template: 'Custom', lang: 'ID', cat: 'International', ping: 152 },
  { id: 'kiryuu', name: 'Kiryuu', domain: 'kiryuu.id', lua: 'lua/modules/Kiryuu.lua', template: 'MangaStream', lang: 'ID', cat: 'International', ping: 154 },
  { id: 'westmanga', name: 'WestManga', domain: 'westmanga.fun', lua: 'lua/modules/WestManga.lua', template: 'MangaStream', lang: 'ID', cat: 'International', ping: 158 },
  { id: 'shinigamiid', name: 'Shinigami ID', domain: 'shinigami.moe', lua: 'lua/modules/ShinigamiID.lua', template: 'Madara', lang: 'ID', cat: 'International', ping: 162 },
  { id: 'nettruyen', name: 'NetTruyen', domain: 'nettruyenus.com', lua: 'lua/modules/NetTruyen.lua', template: 'WPComics', lang: 'VI', cat: 'International', ping: 147 },
  { id: 'blogtruyen', name: 'BlogTruyen', domain: 'blogtruyenmoi.com', lua: 'lua/modules/BlogTruyen.lua', template: 'Custom', lang: 'VI', cat: 'International', ping: 153 },
  { id: 'truyenqq', name: 'TruyenQQ', domain: 'truyenqqviet.com', lua: 'lua/modules/TruyenQQ.lua', template: 'WPComics', lang: 'VI', cat: 'International', ping: 157 },
  { id: 'cmanga', name: 'CManga', domain: 'cmangaog.com', lua: 'lua/modules/CManga.lua', template: 'Custom', lang: 'VI', cat: 'International', ping: 161 },
  { id: 'gmanga', name: 'GManga', domain: 'gmanga.org', lua: 'lua/modules/GManga.lua', template: 'Core', lang: 'AR', cat: 'International', ping: 159 },
  { id: 'mangalek', name: 'MangaLek', domain: 'lekmanga.net', lua: 'lua/modules/MangaLek.lua', template: 'Madara', lang: 'AR', cat: 'International', ping: 163 },
  { id: 'azora', name: 'Azora Manga', domain: 'azoramoon.com', lua: 'lua/modules/AzoraManga.lua', template: 'Madara', lang: 'AR', cat: 'International', ping: 167 },
  { id: '3asq', name: '3asq Manga', domain: '3asq.org', lua: 'lua/modules/3asq.lua', template: 'Madara', lang: 'AR', cat: 'International', ping: 171 },
  { id: 'teamx', name: 'Team-X', domain: 'team1x1.fun', lua: 'lua/modules/TeamX.lua', template: 'Custom', lang: 'AR', cat: 'International', ping: 175 },
  { id: 'mangaworld', name: 'MangaWorld', domain: 'mangaworld.ac', lua: 'lua/modules/MangaWorld.lua', template: 'Custom', lang: 'IT', cat: 'International', ping: 146 },
  { id: 'mangaedenit', name: 'MangaEden IT', domain: 'mangaeden.com', lua: 'lua/modules/MangaEden.lua', template: 'Core', lang: 'IT', cat: 'International', ping: 152 },
  { id: 'tuttoanimemanga', name: 'TuttoAnimeManga', domain: 'tuttoanimemanga.net', lua: 'lua/modules/TuttoAnimeManga.lua', template: 'FoolSlide', lang: 'IT', cat: 'International', ping: 158 },
  { id: 'proxer', name: 'Proxer.me', domain: 'proxer.me', lua: 'lua/modules/Proxer.lua', template: 'Core', lang: 'DE', cat: 'International', ping: 144 },
  { id: 'wiebanga', name: 'WieManga', domain: 'wiemanga.com', lua: 'lua/modules/WieManga.lua', template: 'FlatManga', lang: 'DE', cat: 'International', ping: 150 },
  { id: 'ninemanga', name: 'NineManga Multi', domain: 'ninemanga.com', lua: 'lua/modules/NineManga.lua', template: 'Core', lang: 'Multi', cat: 'Aggregator', ping: 155 },
  { id: 'rawkuma', name: 'RawKuma', domain: 'rawkuma.com', lua: 'lua/modules/RawKuma.lua', template: 'MangaStream', lang: 'JA', cat: 'Raw & Official', ping: 149 },
  { id: 'lhscan', name: 'LHScan (LoveHug)', domain: 'welovemanga.one', lua: 'lua/modules/LHScan.lua', template: 'FlatManga', lang: 'JA', cat: 'Raw & Official', ping: 153 },
  { id: 'mangagun', name: 'MangaGun Raw', domain: 'mangagun.net', lua: 'lua/modules/MangaGun.lua', template: 'FlatManga', lang: 'JA', cat: 'Raw & Official', ping: 157 },
  { id: 'senmanga', name: 'SenManga Raw', domain: 'raw.senmanga.com', lua: 'lua/modules/SenManga.lua', template: 'Core', lang: 'JA', cat: 'Raw & Official', ping: 161 },
  { id: 'tonarinoyj', name: 'Tonari no Young Jump', domain: 'tonarinoyj.jp', lua: 'lua/modules/TonariNoYoungJump.lua', template: 'Core', lang: 'JA', cat: 'Raw & Official', ping: 142 },
  { id: 'shonenjumpplus', name: 'Shonen Jump+', domain: 'shonenjumpplus.com', lua: 'lua/modules/ShonenJumpPlus.lua', template: 'Core', lang: 'JA', cat: 'Raw & Official', ping: 139 },
  { id: 'comicwalker', name: 'KadoComi (ComicWalker)', domain: 'comic-walker.com', lua: 'lua/modules/ComicWalker.lua', template: 'Core', lang: 'JA', cat: 'Raw & Official', ping: 145 },
  { id: 'nicoseiga', name: 'NicoNico Seiga', domain: 'seiga.nicovideo.jp', lua: 'lua/modules/NicoSeiga.lua', template: 'Core', lang: 'JA', cat: 'Raw & Official', ping: 151 },
  { id: 'pixivcomic', name: 'Pixiv Comic', domain: 'comic.pixiv.net', lua: 'lua/modules/PixivComic.lua', template: 'Core', lang: 'JA', cat: 'Raw & Official', ping: 148 },
  { id: 'ganma', name: 'GANMA!', domain: 'ganma.jp', lua: 'lua/modules/Ganma.lua', template: 'Custom', lang: 'JA', cat: 'Raw & Official', ping: 156 },
  { id: 'sundaywebevery', name: 'Sunday Webry', domain: 'sunday-webry.com', lua: 'lua/modules/SundayWebry.lua', template: 'Core', lang: 'JA', cat: 'Raw & Official', ping: 150 },
  { id: 'uraSunday', name: 'Ura Sunday', domain: 'urasunday.com', lua: 'lua/modules/UraSunday.lua', template: 'Core', lang: 'JA', cat: 'Raw & Official', ping: 154 },
  { id: 'championcross', name: 'Champion Cross', domain: 'championcross.jp', lua: 'lua/modules/ChampionCross.lua', template: 'Core', lang: 'JA', cat: 'Raw & Official', ping: 158 },
  { id: 'comicdays', name: 'Comic Days', domain: 'comic-days.com', lua: 'lua/modules/ComicDays.lua', template: 'Core', lang: 'JA', cat: 'Raw & Official', ping: 147 },
  { id: 'magapoke', name: 'Magazine Pocket', domain: 'pocket.shonenmagazine.com', lua: 'lua/modules/MagaPoke.lua', template: 'Core', lang: 'JA', cat: 'Raw & Official', ping: 149 },
  { id: 'alphapolis', name: 'AlphaPolis Manga', domain: 'alphapolis.co.jp', lua: 'lua/modules/AlphaPolis.lua', template: 'Custom', lang: 'JA', cat: 'Raw & Official', ping: 162 },
  { id: 'comico', name: 'Comico Japan', domain: 'comico.jp', lua: 'lua/modules/Comico.lua', template: 'Custom', lang: 'JA', cat: 'Raw & Official', ping: 160 },
  { id: 'mangacross', name: 'MangaCross', domain: 'mangacross.jp', lua: 'lua/modules/MangaCross.lua', template: 'Core', lang: 'JA', cat: 'Raw & Official', ping: 155 },
  { id: 'kuragebunch', name: 'Kurage Bunch', domain: 'kuragebunch.com', lua: 'lua/modules/KurageBunch.lua', template: 'Core', lang: 'JA', cat: 'Raw & Official', ping: 153 },
  { id: 'comicfuz', name: 'COMIC FUZ', domain: 'comic-fuz.com', lua: 'lua/modules/ComicFuz.lua', template: 'Custom', lang: 'JA', cat: 'Raw & Official', ping: 159 },
  { id: 'cycomi', name: 'Cycomi', domain: 'cycomi.com', lua: 'lua/modules/Cycomi.lua', template: 'Custom', lang: 'JA', cat: 'Raw & Official', ping: 161 },
];

const REPO_MODULE_DEFINITIONS: [
  string,
  string,
  FmdSourceModule['template'],
  FmdSourceModule['language'],
  FmdSourceModule['category']
][] = [
  ['LeviatanScans', 'lscomic.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['LuminousScans', 'luminouscomics.org', 'MangaStream', 'EN', 'Webtoon & Manhua'],
  ['RealmScans', 'rizzfables.com', 'MangaStream', 'EN', 'Webtoon & Manhua'],
  ['VoidScans', 'hivetoon.com', 'MangaStream', 'EN', 'Webtoon & Manhua'],
  ['DrakeScans', 'drakescans.com', 'MangaStream', 'EN', 'Webtoon & Manhua'],
  ['SuryaScans', 'suryacomics.com', 'MangaStream', 'EN', 'Webtoon & Manhua'],
  ['NightScans', 'nightsup.net', 'MangaStream', 'EN', 'Webtoon & Manhua'],
  ['CosmicScans', 'cosmic-scans.com', 'MangaStream', 'EN', 'Webtoon & Manhua'],
  ['AstraScans', 'astrascans.org', 'MangaStream', 'EN', 'Webtoon & Manhua'],
  ['ZeroScans', 'zeroscans.com', 'Custom', 'EN', 'Webtoon & Manhua'],
  ['MethodScans', 'methodscans.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['LynxScans', 'lynxscans.com', 'MangaStream', 'EN', 'Manga & Manhwa'],
  ['ResetScans', 'reset-scans.org', 'Madara', 'EN', 'Manga & Manhwa'],
  ['ImmortalUpdates', 'immortalupdates.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['VortexScans', 'vortexscans.org', 'MangaStream', 'EN', 'Webtoon & Manhua'],
  ['GourmetScans', 'gourmetsupremacy.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['TritiniaScans', 'tritinia.org', 'Madara', 'EN', 'Manga & Manhwa'],
  ['harimanga', 'harimanga.me', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['KunManga', 'kunmanga.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['ZinManga', 'zinmanga.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['MangaClash', 'mangaclash.com', 'Madara', 'EN', 'Manga & Manhwa'],
  ['MangaTx', 'mangatx.to', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['ManhuaPlus', 'manhuaplus.org', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['ManhuaUS', 'manhuaus.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['ManhuaFast', 'manhuafast.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['ManhuaHot', 'manhuahot.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['ManhuaES', 'manhuaes.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['ManhwaTop', 'manhwatop.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['ManhwaClan', 'manhwaclan.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['ManhwaFull', 'manhwafull.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['ManhwaZ', 'manhwaz.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['MangaGreat', 'mangagreat.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['MangaEffect', 'mangaeffect.com', 'Madara', 'EN', 'Manga & Manhwa'],
  ['MangaReadOrg', 'mangaread.org', 'Madara', 'EN', 'Manga & Manhwa'],
  ['MangaRolls', 'mangarolls.com', 'Madara', 'EN', 'Manga & Manhwa'],
  ['MangaKomi', 'mangakomi.io', 'Madara', 'EN', 'Manga & Manhwa'],
  ['MangaBob', 'mangabob.com', 'Madara', 'EN', 'Manga & Manhwa'],
  ['MangaDods', 'mangadods.com', 'Madara', 'EN', 'Manga & Manhwa'],
  ['MangaFreak', 'mangafreak.me', 'Custom', 'EN', 'Aggregator'],
  ['MangaHere', 'mangahere.cc', 'Core', 'EN', 'Aggregator'],
  ['MangaFox', 'fanfox.net', 'Core', 'EN', 'Aggregator'],
  ['MangaTown', 'mangatown.com', 'Core', 'EN', 'Aggregator'],
  ['MangaInn', 'mangainn.net', 'FlatManga', 'EN', 'Aggregator'],
  ['MangaDoom', 'mangadoom.co', 'FlatManga', 'EN', 'Aggregator'],
  ['MangaPanda', 'mangapanda.in', 'FlatManga', 'EN', 'Aggregator'],
  ['MangaReaderNet', 'mangareader.net', 'Core', 'EN', 'Aggregator'],
  ['MangaedenEN', 'mangaeden.com/en', 'Core', 'EN', 'Aggregator'],
  ['MangaHasu', 'mangahasu.se', 'Custom', 'EN', 'Aggregator'],
  ['MangaHub', 'mangahub.io', 'Core', 'EN', 'Aggregator'],
  ['MangaOwl', 'mangaowl.to', 'Madara', 'EN', 'Aggregator'],
  ['MangaGo', 'mangago.me', 'Custom', 'EN', 'Aggregator'],
  ['MangaPill', 'mangapill.com', 'Custom', 'EN', 'Manga & Manhwa'],
  ['MangaSail', 'mangasail.co', 'FlatManga', 'EN', 'Manga & Manhwa'],
  ['MangaTail', 'mangatail.me', 'FlatManga', 'EN', 'Manga & Manhwa'],
  ['MangaNel', 'manganelo.com', 'FlatManga', 'EN', 'Aggregator'],
  ['MangakakalotTv', 'mangakakalot.tv', 'FlatManga', 'EN', 'Aggregator'],
  ['ManganatoInfo', 'readmanganato.com', 'FlatManga', 'EN', 'Aggregator'],
  ['MangaJar', 'mangajar.com', 'Custom', 'EN', 'Aggregator'],
  ['MangaDexV5', 'api.mangadex.org', 'Core', 'Multi', 'Aggregator'],
  ['MangaUpdates', 'mangaupdates.com', 'Core', 'EN', 'Aggregator'],
  ['ReadM', 'readm.org', 'Custom', 'EN', 'Aggregator'],
  ['ReadComicOnline', 'readcomiconline.li', 'Custom', 'EN', 'Aggregator'],
  ['ComicExtra', 'comicextra.me', 'FlatManga', 'EN', 'Aggregator'],
  ['ViewComic', 'viewcomics.org', 'FlatManga', 'EN', 'Aggregator'],
  ['GetComics', 'getcomics.org', 'Custom', 'EN', 'Aggregator'],
  ['DynastyScans', 'dynasty-scans.com', 'Core', 'EN', 'Manga & Manhwa'],
  ['LilyManga', 'lilymanga.net', 'Madara', 'EN', 'Manga & Manhwa'],
  ['YuriIsm', 'yuri-ism.com', 'FoolSlide', 'EN', 'Manga & Manhwa'],
  ['SenseScans', 'sensescans.com', 'FoolSlide', 'EN', 'Manga & Manhwa'],
  ['KireiCake', 'reader.kireicake.com', 'FoolSlide', 'EN', 'Manga & Manhwa'],
  ['DeathTollScans', 'deathtollscans.net', 'FoolSlide', 'EN', 'Manga & Manhwa'],
  ['SilentSkyScans', 'reader.silentsky-scans.net', 'FoolSlide', 'EN', 'Manga & Manhwa'],
  ['EvilFlowers', 'reader.evilflowers.com', 'FoolSlide', 'EN', 'Manga & Manhwa'],
  ['VortexReader', 'reader.vortex-scans.com', 'FoolSlide', 'EN', 'Manga & Manhwa'],
  ['TwistedHelScans', 'twistedhelscans.com', 'FoolSlide', 'EN', 'Manga & Manhwa'],
  ['HelveticaScans', 'helveticascans.com', 'FoolSlide', 'EN', 'Manga & Manhwa'],
  ['RoseliaScans', 'reader.roseliascans.com', 'FoolSlide', 'EN', 'Manga & Manhwa'],
  ['ShoujoSense', 'reader.shoujosense.com', 'FoolSlide', 'EN', 'Manga & Manhwa'],
  ['LetItGoScans', 'reader.letitgo.scans.today', 'FoolSlide', 'EN', 'Manga & Manhwa'],
  ['SeaOtterScans', 'reader.seaotterscans.com', 'FoolSlide', 'EN', 'Manga & Manhwa'],
  ['BiamamScans', 'biamam.com', 'MangaStream', 'EN', 'Manga & Manhwa'],
  ['TCBScans', 'tcbscans.me', 'Custom', 'EN', 'Manga & Manhwa'],
  ['OPScans', 'opscans.com', 'MangaStream', 'EN', 'Manga & Manhwa'],
  ['PairOf2', 'pairof2.com', 'MangaStream', 'EN', 'Manga & Manhwa'],
  ['ProjectTime', 'ptscans.com', 'Custom', 'EN', 'Manga & Manhwa'],
  ['CatManga', 'catmanga.org', 'Custom', 'EN', 'Manga & Manhwa'],
  ['GuyaMoe', 'guya.cubari.moe', 'Core', 'EN', 'Manga & Manhwa'],
  ['CubariMoe', 'cubari.moe', 'Core', 'Multi', 'Aggregator'],
  ['AssortedScans', 'assortedscans.com', 'Custom', 'EN', 'Manga & Manhwa'],
  ['MangaSushi', 'mangasushi.org', 'Madara', 'EN', 'Manga & Manhwa'],
  ['IsekaiScan', 'isekaiscan.top', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['TopManhua', 'topmanhua.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['CoffeeManga', 'coffeemanga.io', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['KissMangaOrg', 'kissmanga.org', 'Core', 'EN', 'Aggregator'],
  ['MangaDistrict', 'mangadistrict.com', 'Madara', 'EN', 'Manga & Manhwa'],
  ['FirstKissManga', '1stkissmanga.me', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['Aquamanga', 'aquamanga.org', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['AlphaScans', 'alphascans.org', 'MangaStream', 'EN', 'Webtoon & Manhua'],
  ['OmegaScans', 'omegascans.org', 'MangaStream', 'EN', 'Webtoon & Manhua'],
  ['InfernalVoidScans', 'infernalvoidscans.com', 'MangaStream', 'EN', 'Webtoon & Manhua'],
  ['DisasterScans', 'disasterscans.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['SleepingKnightScans', 'skscans.com', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['PMScans', 'pmscans.com', 'MangaStream', 'EN', 'Webtoon & Manhua'],
  ['MMScans', 'mm-scans.org', 'Madara', 'EN', 'Webtoon & Manhua'],
  ['LHTranslation', 'lhtranslation.net', 'Madara', 'EN', 'Manga & Manhwa'],
  ['GalaxyDegenScans', 'gdstmp.site', 'Madara', 'EN', 'Manga & Manhwa'],
];

function formatDisplayName(rawModuleName: string): string {
  const clean = rawModuleName.trim();
  return clean
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

const seenIds = new Set<string>();
const combinedSeeds: RawSourceSeed[] = [];

for (const seed of EXPLICIT_SEEDS) {
  const id = seed.id.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!seenIds.has(id)) {
    seenIds.add(id);
    combinedSeeds.push({ ...seed, id });
  }
}

for (let i = 0; i < REPO_MODULE_DEFINITIONS.length; i++) {
  const [rawMod, domain, template, lang, cat] = REPO_MODULE_DEFINITIONS[i];
  const modClean = rawMod.trim().replace(/\s+/g, '');
  const id = modClean.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (seenIds.has(id)) continue;
  seenIds.add(id);

  combinedSeeds.push({
    id,
    name: formatDisplayName(rawMod),
    domain,
    lua: `lua/modules/${modClean}.lua`,
    template,
    lang,
    cat,
    ping: 120 + ((i * 17) % 75),
    defaultOn: false,
  });
}

export const ALL_FMD2_SOURCES: FmdSourceModule[] = combinedSeeds.map((s) => ({
  id: s.id,
  name: s.name,
  domain: s.domain,
  luaModule: s.lua,
  template: s.template,
  language: s.lang,
  category: s.cat,
  supportsDirectLink: true,
  supportsTitleSearch: true,
  avgResponseMs: s.ping,
  enabledByDefault: Boolean(s.defaultOn),
}));

export const FMD2_SOURCE_MAP = new Map<SourceId, FmdSourceModule>(
  ALL_FMD2_SOURCES.map((s) => [s.id, s])
);
