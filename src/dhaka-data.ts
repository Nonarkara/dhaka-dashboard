/**
 * Authoritative reference and observed data registries for Dhaka.
 * Sourced from Bangladesh Bank, Bangladesh Bureau of Statistics (BBS),
 * Export Promotion Bureau (EPB), Dhaka Stock Exchange (DSE),
 * and Bangladesh Water Development Board (BWDB) / FFWC.
 */

export interface MacroIndicator {
  id: string;
  category: "export" | "remittance" | "market" | "inflation" | "reserves" | "currency";
  name: string;
  name_bn: string;
  value: null;
  unit: string;
  unit_bn: string;
  period: string;
  source: string;
  source_url: string;
  provenance: "unavailable";
  note: string;
  note_bn: string;
}

export const MACRO_INDICATORS: MacroIndicator[] = [
  {
    id: "rmg-export-knit",
    category: "export",
    name: "RMG Knitwear Exports",
    name_bn: "নিটওয়্যার তৈরি পোশাক রপ্তানি",
    value: null,
    unit: "Million USD / month",
    unit_bn: "মিলিয়ন মার্কিন ডলার / মাস",
    period: "Monthly bulletin",
    source: "Export Promotion Bureau (EPB) / Bangladesh Bank",
    source_url: "https://www.bb.org.bd",
    provenance: "unavailable",
    note: "Primary manufacturing export engine centered in Savar, Gazipur and Narayanganj corridors.",
    note_bn: "সাভার, গাজীপুর ও নারায়ণগঞ্জ শিল্প অঞ্চলের প্রধান রপ্তানি চালিকাশক্তি।"
  },
  {
    id: "rmg-export-woven",
    category: "export",
    name: "RMG Woven Garments Exports",
    name_bn: "ওভেন তৈরি পোশাক রপ্তানি",
    value: null,
    unit: "Million USD / month",
    unit_bn: "মিলিয়ন মার্কিন ডলার / মাস",
    period: "Monthly bulletin",
    source: "Export Promotion Bureau (EPB) / Bangladesh Bank",
    source_url: "https://www.bb.org.bd",
    provenance: "unavailable",
    note: "Second largest export sector supplying top EU and US apparel retail partners.",
    note_bn: "ইউরোপ ও মার্কিন বাজারের শীর্ষ ব্র্যান্ডসমূহের দ্বিতীয় বৃহত্তম রপ্তানি খাত।"
  },
  {
    id: "worker-remittance",
    category: "remittance",
    name: "Inward Foreign Remittance",
    name_bn: "প্রবাসী আয় (রেমিট্যান্স)",
    value: null,
    unit: "Million USD / month",
    unit_bn: "মিলিয়ন মার্কিন ডলার / মাস",
    period: "Monthly receipts",
    source: "Bangladesh Bank Foreign Exchange Policy Dept",
    source_url: "https://www.bb.org.bd",
    provenance: "unavailable",
    note: "Direct household income driver fueling consumer spending and real estate construction across Dhaka.",
    note_bn: "ঢাকার আবাসন ও ভোক্তা ব্যয়ের প্রধান সহায়ক বৈদেশিক মুদ্রা প্রবাহ।"
  },
  {
    id: "dsex-index",
    category: "market",
    name: "Dhaka Stock Exchange DSEX Index",
    name_bn: "ডিএসইএক্স বেঞ্চমার্ক সূচক",
    value: null,
    unit: "Index points",
    unit_bn: "সূচক পয়েন্ট",
    period: "Latest session close",
    source: "Dhaka Stock Exchange (DSE)",
    source_url: "https://www.dsebd.org",
    provenance: "unavailable",
    note: "Core equity benchmark tracking capital market valuation in Motijheel financial district.",
    note_bn: "মতিঝিল আর্থিক কেন্দ্রের পুঁজিবাজার মূল্যায়নের প্রধান বেঞ্চমার্ক।"
  },
  {
    id: "cpi-inflation-general",
    category: "inflation",
    name: "Headline Inflation (CPI)",
    name_bn: "সার্বিক মূল্যস্ফীতি (সিপিআই)",
    value: null,
    unit: "% YoY",
    unit_bn: "% বার্ষিক",
    period: "BBS Monthly Consumer Price Index",
    source: "Bangladesh Bureau of Statistics (BBS)",
    source_url: "http://www.bbs.gov.bd",
    provenance: "unavailable",
    note: "General consumer price inflation reflecting living costs in urban metropolitan Dhaka.",
    note_bn: "ঢাকা মেট্রোপলিটন এলাকায় জীবনযাত্রার ব্যয়ের সার্বিক প্রতিফলন।"
  },
  {
    id: "cpi-inflation-food",
    category: "inflation",
    name: "Food Price Inflation",
    name_bn: "খাদ্য মূল্যস্ফীতি",
    value: null,
    unit: "% YoY",
    unit_bn: "% বার্ষিক",
    period: "BBS Monthly Consumer Price Index",
    source: "Bangladesh Bureau of Statistics (BBS)",
    source_url: "http://www.bbs.gov.bd",
    provenance: "unavailable",
    note: "Food inflation index affecting wholesale markets like Kawran Bazar and retail supply chains.",
    note_bn: "কাওরান বাজারসহ খুচরা খাদ্য সরবরাহ চেইনে খাদ্যপণ্যের মূল্যের চাপ।"
  },
  {
    id: "forex-reserves-bpm6",
    category: "reserves",
    name: "Foreign Exchange Reserves (BPM6)",
    name_bn: "বৈদেশিক মুদ্রার রিজার্ভ (বিপিএম৬)",
    value: null,
    unit: "Million USD",
    unit_bn: "মিলিয়ন মার্কিন ডলার",
    period: "Official balance",
    source: "Bangladesh Bank Accounts & Budgeting Dept",
    source_url: "https://www.bb.org.bd",
    provenance: "unavailable",
    note: "Net usable reserves evaluated under IMF BPM6 accounting standards.",
    note_bn: "আইএমএফ বিপিএম৬ হিসাবরীতি অনুযায়ী নিট ব্যবহারযোগ্য রিজার্ভ।"
  },
  {
    id: "usd-bdt-rate",
    category: "currency",
    name: "Interbank USD / BDT Rate",
    name_bn: "আন্তঃব্যাংক ডলার / টাকা বিনিময় হার",
    value: null,
    unit: "BDT per USD",
    unit_bn: "টাকা / মার্কিন ডলার",
    period: "Crawling peg benchmark",
    source: "Bangladesh Bank Interbank Foreign Exchange Desk",
    source_url: "https://www.bb.org.bd",
    provenance: "unavailable",
    note: "Crawling peg corridor exchange rate governing import-export settlement.",
    note_bn: "আমদানি ও রপ্তানি নিষ্পত্তির মধ্যবর্তী বিনিময় হার।"
  }
];

export interface RiverStation {
  id: string;
  name: string;
  name_bn: string;
  river: string;
  river_bn: string;
  station_code: string;
  danger_level_m: number;
  warning_level_m: number;
  highest_flood_level_m: number;
  highest_flood_year: number;
  current_level_m: null;
  trend: "unavailable";
  status: "unavailable";
  lat: number;
  lng: number;
  agency: string;
  source_url: string;
}

export const RIVER_STATIONS: RiverStation[] = [
  {
    id: "buriganga-mill-barrage",
    name: "Buriganga at Dhaka (Mill Barrage)",
    name_bn: "বুড়িগঙ্গা (ঢাকা মিল ব্যারাজ)",
    river: "Buriganga",
    river_bn: "বুড়িগঙ্গা",
    station_code: "SW42",
    danger_level_m: 5.55,
    warning_level_m: 5.05,
    highest_flood_level_m: 7.58,
    highest_flood_year: 1988,
    current_level_m: null,
    trend: "unavailable",
    status: "unavailable",
    lat: 23.7001,
    lng: 90.4150,
    agency: "BWDB / FFWC",
    source_url: "https://ffwc.gov.bd"
  },
  {
    id: "turag-mirpur",
    name: "Turag at Mirpur",
    name_bn: "তুরাগ (মিরপুর)",
    river: "Turag",
    river_bn: "তুরাগ",
    station_code: "SW299",
    danger_level_m: 5.50,
    warning_level_m: 5.00,
    highest_flood_level_m: 8.35,
    highest_flood_year: 1998,
    current_level_m: null,
    trend: "unavailable",
    status: "unavailable",
    lat: 23.7980,
    lng: 90.3420,
    agency: "BWDB / FFWC",
    source_url: "https://ffwc.gov.bd"
  },
  {
    id: "balu-demra",
    name: "Balu at Demra",
    name_bn: "বালু (ডেমরা)",
    river: "Balu",
    river_bn: "বালু",
    station_code: "SW08",
    danger_level_m: 5.75,
    warning_level_m: 5.25,
    highest_flood_level_m: 7.13,
    highest_flood_year: 1998,
    current_level_m: null,
    trend: "unavailable",
    status: "unavailable",
    lat: 23.7140,
    lng: 90.5050,
    agency: "BWDB / FFWC",
    source_url: "https://ffwc.gov.bd"
  },
  {
    id: "lakhya-narayanganj",
    name: "Shitalakshya at Narayanganj",
    name_bn: "শীতলক্ষ্যা (নারায়ণগঞ্জ)",
    river: "Shitalakshya",
    river_bn: "শীতলক্ষ্যা",
    station_code: "SW179",
    danger_level_m: 5.50,
    warning_level_m: 5.00,
    highest_flood_level_m: 6.93,
    highest_flood_year: 1998,
    current_level_m: null,
    trend: "unavailable",
    status: "unavailable",
    lat: 23.6190,
    lng: 90.5110,
    agency: "BWDB / FFWC",
    source_url: "https://ffwc.gov.bd"
  },
  {
    id: "tongi-khal-tongi",
    name: "Tongi Khal at Tongi",
    name_bn: "টঙ্গী খাল (টঙ্গী)",
    river: "Tongi Khal",
    river_bn: "টঙ্গী খাল",
    station_code: "SW298",
    danger_level_m: 6.08,
    warning_level_m: 5.58,
    highest_flood_level_m: 7.84,
    highest_flood_year: 1998,
    current_level_m: null,
    trend: "unavailable",
    status: "unavailable",
    lat: 23.8890,
    lng: 90.4010,
    agency: "BWDB / FFWC",
    source_url: "https://ffwc.gov.bd"
  },
  {
    id: "dhaleshwari-rekabi-bazar",
    name: "Dhaleshwari at Rekabi Bazar",
    name_bn: "ধলেশ্বরী (রেকাবি বাজার)",
    river: "Dhaleshwari",
    river_bn: "ধলেশ্বরী",
    station_code: "SW68",
    danger_level_m: 5.18,
    warning_level_m: 4.68,
    highest_flood_level_m: 7.42,
    highest_flood_year: 1988,
    current_level_m: null,
    trend: "unavailable",
    status: "unavailable",
    lat: 23.5630,
    lng: 90.4950,
    agency: "BWDB / FFWC",
    source_url: "https://ffwc.gov.bd"
  }
];

export interface AirStation {
  id: string;
  name: string;
  name_bn: string;
  lat: number;
  lng: number;
  zone: string;
  zone_bn: string;
  characteristic: string;
  characteristic_bn: string;
}

export const AIR_STATIONS: AirStation[] = [
  {
    id: "uttara-airport",
    name: "Uttara / HSIA Airport",
    name_bn: "উত্তরা / বিমানবন্দর",
    lat: 23.8759,
    lng: 90.3795,
    zone: "Northern Gateway",
    zone_bn: "উত্তর প্রবেশদ্বার",
    characteristic: "Affected by northern highway transit and brick kiln plumes from Gazipur",
    characteristic_bn: "উত্তরাঞ্চলীয় মহাসড়ক ট্রাফিক ও গাজীপুরের ইটভাটার ধোঁয়ায় প্রভাবিত"
  },
  {
    id: "mirpur-pallabi",
    name: "Mirpur / Pallabi",
    name_bn: "মিরপুর / পল্লবী",
    lat: 23.8223,
    lng: 90.3654,
    zone: "Northwestern Urban Core",
    zone_bn: "উত্তর-পশ্চিম ঘনবসতি অঞ্চল",
    characteristic: "High-density residential belt bordered by Turag river industrial sites",
    characteristic_bn: "তুরাগ নদীর তীরবর্তী শিল্প এলাকা সংলগ্ন উচ্চ ঘনবসতিপূর্ণ আবাসিক এলাকা"
  },
  {
    id: "gulshan-diplomatic",
    name: "Gulshan / Banani",
    name_bn: "গুলশান / বনানী",
    lat: 23.7925,
    lng: 90.4078,
    zone: "Diplomatic & Corporate Core",
    zone_bn: "কূটনৈতিক ও করপোরেট কেন্দ্র",
    characteristic: "Commercial high-rises and embassies, lakeside particulate buffer",
    characteristic_bn: "বাণিজ্যিক ভবন ও দূতাবাস, লেক সংলগ্ন বাতাস"
  },
  {
    id: "tejgaon-farmgate",
    name: "Farmgate / Tejgaon",
    name_bn: "ফার্মগেট / তেজগাঁও",
    lat: 23.7592,
    lng: 90.3912,
    zone: "Central Transportation Spine",
    zone_bn: "কেন্দ্রীয় পরিবহন সংযোগ",
    characteristic: "Major vehicular bottleneck and light industrial emission mixing",
    characteristic_bn: "যানবাহনের তীব্র চাপ ও হালকা শিল্প নির্গমনের মিশ্রণ"
  },
  {
    id: "motijheel-cbd",
    name: "Motijheel Financial District",
    name_bn: "মতিঝিল বাণিজ্যিক এলাকা",
    lat: 23.7330,
    lng: 90.4172,
    zone: "Financial Business District",
    zone_bn: "আর্থিক বাণিজ্যিক কেন্দ্র",
    characteristic: "High-density street canyon vehicular emissions and urban heat trap",
    characteristic_bn: "উচ্চ ভবনের স্ট্রিট ক্যানিয়ন এবং তাপীয় প্রভাব"
  },
  {
    id: "puran-dhaka-sadarghat",
    name: "Old Dhaka / Sadarghat",
    name_bn: "পুরান ঢাকা / সদরঘাট",
    lat: 23.7081,
    lng: 90.4124,
    zone: "Historic River Core",
    zone_bn: "ঐতিহাসিক নদী তীরবর্তী এলাকা",
    characteristic: "River vessel diesel exhausts, dense micro-workshops, narrow street geometry",
    characteristic_bn: "লঞ্চের ডিজেল নির্গমন, ছোট কারখানা ও সংকীর্ণ রাস্তার বাতাসের স্থবিরতা"
  },
  {
    id: "savar-industrial",
    name: "Savar / Ashulia Industrial Belt",
    name_bn: "সাভার / আশুলিয়া শিল্পাঞ্চল",
    lat: 23.8583,
    lng: 90.2667,
    zone: "RMG & Kiln Perimeter",
    zone_bn: "পোশাক শিল্প ও ইটভাটা পরিধি",
    characteristic: "Dense cluster of Fixed Chimney Kilns (FCKs) and heavy garment boiler emissions",
    characteristic_bn: "ইটভাটা ক্লাস্টার এবং পোশাক শিল্পের বয়লার নির্গমন"
  }
];
