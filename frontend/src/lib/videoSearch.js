const YOUTUBE_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&\s"']+)/i,
  /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^?#&\s"']+)/i,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^?#&\s"']+)/i,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([^?#&\s"']+)/i,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([^?#&\s"']+)/i,
];

export function extractYouTubeId(text) {
  for (const pattern of YOUTUBE_PATTERNS) {
    const m = text.match(pattern);
    if (m?.[1]) return m[1];
  }
  return null;
}

export const ZAPTEST_VIDEOS_DATABASE = [
  { title: "Computer Vision ZAP Object Engine - ZOE", url: "https://youtu.be/p-rDlRCYzH8", keywords: "computer vision,zoe,object engine,visual testing,image recognition,automation" },
  { title: "1Script Technology", url: "https://youtu.be/EyHxrC3TYF8", keywords: "1script,technology,scripting,automation technique,cross-platform" },
  { title: "Copilot", url: "https://youtu.be/VEWnEYo8E4g", keywords: "copilot,ai,assistant,automation help,smart suggestions" },
  { title: "Copilot demo", url: "https://youtu.be/xVcYYs2SXdw", keywords: "copilot,demo,demonstration,tutorial,ai assistant,practical example" },
  { title: "LOAD Studio", url: "https://youtu.be/PNz-oAYg0m0", keywords: "load,studio,performance testing,stress testing,scalability" },
  { title: "Webdriver", url: "https://youtu.be/6evxxFIK0qQ", keywords: "webdriver,selenium,web automation,browser testing" },
  { title: "RPA promo", url: "https://youtu.be/NItHxipJ1H4", keywords: "rpa,promo,robotic process automation,business,marketing" },
  { title: "Testing Center of Excellence - TCoE", url: "https://youtu.be/ihoO3rktrO8", keywords: "tcoe,testing center,excellence,enterprise,organizational,strategy" },
  { title: "Test Automation Centers Of Excellence: The Future Of BizOps Automation", url: "https://youtu.be/1LF77nTh0OQ", keywords: "automation centers,excellence,bizops,future,enterprise,strategy" },
  { title: "Podcast - API-First & Automation Testing feat. Alex Chernyak of ZAPTEST", url: "https://youtu.be/n6mLcBl9xag", keywords: "podcast,api,api-first,alex chernyak,interview,automation testing" },
  { title: "Podcast - ZAPTEST CEO's StarEast 2022 News Desk Interview", url: "https://youtu.be/S5jrbeW_J3s", keywords: "podcast,ceo,stareast,interview,conference,2022,leadership" },
  { title: "Podcast - 600% Productivity Increase", url: "https://youtu.be/o91DflCoels", keywords: "podcast,productivity,increase,efficiency,case study,600%,roi,business value" },
  { title: "Podcast - Building a Culture of Automation", url: "https://youtu.be/lLmHuSTUu18", keywords: "podcast,culture,automation,organizational,strategy,adoption" },
  { title: "ZAPTEST Tutorial - Mockups", url: "https://youtu.be/fMJ5DCZ1X68", keywords: "tutorial,mockups,design,prototyping,ui,testing" },
  { title: "ZAPTEST Tutorial - Image and Area Objects", url: "https://youtu.be/GgtafJBGMU8", keywords: "tutorial,image,area objects,visual testing,recognition" },
  { title: "ZAPTEST Tutorial - Cross Platform", url: "https://youtu.be/SsmjoA8_PdM", keywords: "tutorial,cross platform,multi-platform,compatibility,mobile,web,desktop" },
  { title: "ZAPTEST Tutorial - DOC Feature", url: "https://youtu.be/7hVfZUPJIA8", keywords: "tutorial,doc,documentation,feature,reporting" },
  { title: "ZAPTEST Tutorial - Recorder Feature", url: "https://youtu.be/-CzEPAGj-iI", keywords: "tutorial,recorder,recording,capture,feature,automation" },
  { title: "ZAPTEST - Load Tutorial - Building First Load Test", url: "https://youtu.be/50Iioep7vkg", keywords: "load,tutorial,performance,testing,first load test,stress testing" },
  { title: "ZAPTEST - API and UI steps", url: "https://youtu.be/G_dp3kASF50", keywords: "api,ui,steps,integration,combined testing,frontend,backend" },
  { title: "ZAPTEST - Getting Started with API Testing", url: "https://youtu.be/oBhe6IMUvYE", keywords: "api testing,getting started,beginner,introduction,web services" },
  { title: "ZAPTEST - Getting Started with API Testing - Scripted", url: "https://youtu.be/3591AHqzJIQ", keywords: "api testing,scripted,programming,code,getting started,advanced" },
  { title: "ZAPTEST - Validations and Request Arguments (Scripted)", url: "https://youtu.be/D1phL1RquT8", keywords: "validations,request arguments,scripted,api,code,testing" },
  { title: "ZAPTEST - Validations and Request Arguments", url: "https://youtu.be/ipIVkm9TtSU", keywords: "validations,request arguments,api,testing,assertions" },
  { title: "ZAPTEST - UI and API Steps (Scripted)", url: "https://youtu.be/Pb9ACvrMsDU", keywords: "ui,api,steps,scripted,code,integration,advanced" },
  { title: "ZAPTEST - REST API Services", url: "https://youtu.be/gZOUB_UVAQI", keywords: "rest,api,services,web services,integration testing,http" },
  { title: "ZAPTEST - REST API Services (Scripted)", url: "https://youtu.be/SL_ZPwolzCc", keywords: "rest,api,services,scripted,code,programming,http" },
  { title: "ZAPTEST - Script-Less Tutorial - Building First Script", url: "https://youtu.be/tBzRhecTvvM", keywords: "script-less,tutorial,no code,first script,low-code,beginners" },
  { title: "ZAPTEST - Script-Less Tutorial - Mockups", url: "https://youtu.be/FmyFGtih85Q", keywords: "script-less,tutorial,mockups,no code,low-code,design,ui" },
  { title: "ZAPTEST - Tutorial: working with Lists and Tables using Script-less mode.", url: "https://youtu.be/NWmTYro0V4g", keywords: "script-less,tutorial,lists,tables,no code,low-code,data" },
  { title: "ZAPTEST Tutorial: working with Lists and Tables using Scripted mode.", url: "https://youtu.be/crBQQs9mC8A", keywords: "tutorial,lists,tables,data structures,automation,scripted,code" },
  { title: "ZAPTEST Tutorial - M-RUN Feature", url: "https://youtu.be/Y9xfLjxRkHM", keywords: "tutorial,m-run,multirun,parallel,feature,execution,multiple platforms" },
  { title: "ZAPTEST - JIRA Integration", url: "https://youtu.be/13xCi1lM69Q", keywords: "jira,integration,atlassian,issue tracking,project management" },
  { title: "Mockup Based Test Automation", url: "https://youtu.be/36rZyh8IQBg", keywords: "mockup,test automation,design,prototyping,ui,requirements" },
  { title: "ZAPFARM Private Cloud", url: "https://youtu.be/6rcA21Lb4Lc", keywords: "zapfarm,private cloud,deployment,infrastructure,enterprise" },
  { title: "ZAPTEST: Jenkins Integration", url: "https://youtu.be/Eb6aoa_u8-0", keywords: "jenkins,integration,ci/cd,devops,continuous integration,pipeline" },
  { title: "ZAPTEST Rally Integration", url: "https://youtu.be/HzIUeiIU-64", keywords: "rally,integration,agile,project management,broadcom" },
  { title: "ZAPTEST Micro Focus ALM Integration", url: "https://youtu.be/AzUns5J7EyM", keywords: "micro focus,alm,application lifecycle management,integration,enterprise" },
  { title: "ZAP Agile Methodology and CI", url: "https://youtu.be/HcF8_0lNCBA", keywords: "agile,ci,continuous integration,methodology,devops,pipeline" },
  { title: "ZAPTEST PDF Test Automation", url: "https://youtu.be/MQaz1Ieh4-E", keywords: "pdf,test automation,document testing,verification,validation" },
  { title: "ZAPTEST - Agile Mockup Demo SL", url: "https://youtu.be/zJnaNVSnF3Q", keywords: "agile,mockup,demo,script-less,sl,requirements,testing" },
  { title: "ZAPTEST - Alex Chernyak - AmericaTrends Interview", url: "https://youtu.be/j5Ef-20LN-0", keywords: "alex chernyak,interview,america trends,ceo,leadership,vision" },
  { title: "ZAPTEST - Script-Less Introduction", url: "https://youtu.be/Y2hi7tvP55g", keywords: "script-less,introduction,no code,low-code,beginner,overview" },
  { title: "ZAPTEST - G-Mode Promo", url: "https://youtu.be/2jhy7SY1h4Q", keywords: "g-mode,promo,marketing,feature,graphic mode,visual" },
  { title: "ZAPTEST - Use Case Automation", url: "https://youtu.be/oNJU6V911zA", keywords: "use case,automation,business process,testing,requirements" },
  { title: "ZAPTEST - Multilingual", url: "https://youtu.be/pgIbAdlgUoM", keywords: "multilingual,languages,internationalization,localization,i18n,l10n" },
  { title: "ZAPTEST API Testing Promo", url: "https://youtu.be/kjEZrQ6W5qc", keywords: "api,testing,promo,marketing,web services,integration" },
  { title: "ZAPTEST UI + API Test Automation", url: "https://youtu.be/jVGC3XgwDbY", keywords: "ui,api,test automation,integration,combined testing,frontend,backend" },
  { title: "Salesforce automation with ZAPTEST", url: "https://youtu.be/viJRYN_5hvc", keywords: "salesforce,automation,crm,cloud,business application" },
  { title: "ZAPTEST - Enterprise Solution", url: "https://youtu.be/8R1iYrwrc0M", keywords: "enterprise,solution,corporate,business,large scale,implementation" },
  { title: "ZAPTEST for Web Testing Demo", url: "https://youtu.be/unNxQH8lMDw", keywords: "web testing,demo,browser automation,web application,ui" },
  { title: "ZAPTEST Test Automation for Windows, Mac OSX, Linux and Unix", url: "https://youtu.be/99ZRBucK3wI", keywords: "windows,mac,osx,linux,unix,cross platform,desktop" },
  { title: "ZAPTEST - LOAD Module Promo", url: "https://youtu.be/pTHIl4SM6zo", keywords: "load,module,promo,performance testing,stress,scalability" },
  { title: "ZAPTEST - Linux Demo", url: "https://youtu.be/22P9GUCrfAA", keywords: "linux,demo,operating system,platform,unix,automation" },
  { title: "ZAPTEST - Citrix Demo", url: "https://youtu.be/iHJIOIRUOaE", keywords: "citrix,demo,virtual desktop,remote,vdi,enterprise" },
  { title: "ZAPTEST - Javascript Support", url: "https://youtu.be/BYnTDxcL6Wg", keywords: "javascript,support,scripting,programming,web,coding" },
  { title: "ZAPTEST - ZAPFARM Promo", url: "https://youtu.be/27Z9OEba9TI", keywords: "zapfarm,promo,cloud,infrastructure,testing environment,lab" },
  { title: "ZAPTEST - URL Scanner", url: "https://youtu.be/zz6hKuLwRcw", keywords: "url scanner,web testing,link checking,site verification,broken links" },
  { title: "ZAPTEST - POS Promo", url: "https://youtu.be/-X1AahN_OAs", keywords: "pos,point of sale,retail,promo,automation,kiosk" },
  { title: "BDD Testing with ZAPTEST vs Cucumber/Selenium", url: "https://youtu.be/yU2psZzIdRI", keywords: "bdd,cucumber,selenium,comparison,behavior driven development,gherkin" },
  { title: "ZAPTEST - TEST+RPA Seamless Automation Promo", url: "https://youtu.be/PvoTaeH1YLo", keywords: "rpa,test,automation,promo,robotic process automation,business process" },
  { title: "ZAPTEST - The Game Changer", url: "https://youtu.be/H1LEXfkXam8", keywords: "game changer,innovation,disruptive technology,advantages,benefits" },
  { title: "ZAP Recorder - Generate Test Automation from Videos", url: "https://youtu.be/RBg5_Kxgpjk", keywords: "recorder,video,generate,test automation,capture,automated creation" },
  { title: "ZAPTEST DOC - 1 Script / 1 Click", url: "https://youtu.be/QZRxD7ToV5c", keywords: "doc,1 script,1 click,documentation,feature,reporting,simplicity" },
  { title: "ZAPTEST - Demo of Test Automation Approaches, API, and LOAD", url: "https://youtu.be/27gTOakggGM", keywords: "demo,test automation,approaches,api,load,comprehensive,overview" },
  { title: "ZAPTEST - M-RUN Overview", url: "https://youtu.be/g2huJY5JoU8", keywords: "m-run,overview,parallel,execution,multi-platform,efficiency" },
];

export function findVideoForMessage(message) {
  const lower = message.toLowerCase();
  const words = lower.match(/\b\w{3,}\b/g) || [];

  let bestScore = 0;
  let bestVideoId = null;

  for (const video of ZAPTEST_VIDEOS_DATABASE) {
    const kwList = video.keywords.toLowerCase().split(",").map((k) => k.trim());
    let score = 0;
    for (const word of words) {
      if (kwList.some((kw) => kw === word || kw.includes(word))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestVideoId = extractYouTubeId(video.url);
    }
  }

  return bestScore > 0 ? bestVideoId : null;
}
