const urls = [ 
  "https://gist.githubusercontent.com/Prismic247/930d08f34c61e4282992cdb3afbafca0/raw/pasavtrdb.txt",
  "https://gist.githubusercontent.com/Prismic247/930d08f34c61e4282992cdb3afbafca0/raw/pasavtrdb_qst.txt",
  "https://gist.githubusercontent.com/Prismic247/930d08f34c61e4282992cdb3afbafca0/raw/pasavtrdb_ios.txt"
];

// Unused, also 404
const backupUrls = [
  "https://prismic.net/vrc/pasavtrdb.txt",
  "https://prismic.net/vrc/pasavtrdb_qst.txt",
  "https://prismic.net/vrc/pasavtrdb.txt" // rip IOS users
];

var db;
var searchData;
var aviTemplate;
var searchGrid;
var lastLoadingText = "Initializing website"
var ready = false;
var searchResults = [];
var lastSearch = "";
var visibleElements = 0;
var resultsPerPage = 50;

function makeAviElement(dict) {
  const clone = aviTemplate.content.cloneNode(true);

  clone.querySelector(".avi-name").innerText = dict.name;
  clone.querySelector(".avi-author").innerText = dict.author;
  clone.querySelector(".avi-description").innerText = dict.description;
  clone.querySelector(".website").href = "https://vrchat.com/home/avatar/" + dict.avatrId;
  clone.querySelector(".vrcx").href = "vrcx://avatar/" + dict.avatrId;
  if(dict.quest) {
    clone.querySelector(".quest").classList.remove("disabled");
  }
  if(dict.ios) {
    clone.querySelector(".ios").classList.remove("disabled");
  }
  return clone;
}

function searchMatched(item) {
  if(resultsPerPage > visibleElements) {
    searchGrid.appendChild(makeAviElement(item));
    visibleElements++;
  }
  searchResults.push(item);
}

function updateSize() {
  var x = window.innerWidth;
  var y = window.innerHeight;
  var elementsX = Math.floor(x/256);
  var elementsY = Math.floor(y/192);
  var totalElements = elementsX*(elementsY+1);
  resultsPerPage = totalElements;
  updateScroll();
}

function updateScroll() {
  const scrollPosition = window.innerHeight + window.scrollY;
  const bottomPosition = document.documentElement.scrollHeight;

  if (scrollPosition >= bottomPosition - 100) { // Trigger load when close to bottom
    var newCount = Math.min(visibleElements+resultsPerPage, searchResults.length);
    for(var i = visibleElements; i < newCount; i++) {
      searchGrid.appendChild(makeAviElement(searchResults[i]));
      visibleElements++;
    }
  }
}

window.addEventListener("resize", e=>{
  updateSize();
});
window.addEventListener("scroll", e=>{
  updateScroll();
});

window.addEventListener("DOMContentLoaded", e=>{
  updateSize();
  aviTemplate = document.getElementById("avi");
  searchGrid = document.querySelector(".grid-container");

  var searchForm = document.getElementById("searchform");
  searchForm.addEventListener("submit", e=>{
    e.preventDefault();

    var formData = new FormData(searchform);
    var query = formData.get("vrc_avatar_search").trim().toLowerCase();
    var names = formData.get("search_name");
    var authors = formData.get("search_author");
    var descriptions = formData.get("search_description");
    if(query == lastSearch) return;
    
    searchResults = [];
    visibleElements = 0;
    searchGrid.replaceChildren();

    // because the guy adds avatars to the end, these are the newest avatars
    for(var i = searchData.entries.length - 1; i >= 0; i--) {
      const entry = searchData.entries[i];
      if(names && entry.name && entry.name.toLowerCase().includes(query)) {
        searchMatched(entry);
        continue;
      }
      if(authors && entry.author && entry.author.toLowerCase().includes(query)) {
        searchMatched(entry);
        continue;
      }
      if(descriptions && entry.description && entry.description.toLowerCase().includes(query)) {
        searchMatched(entry);
        continue;
      }
    }
    document.getElementById("result-count").innerText = `Found ${searchResults.length} avatars.`;
  });

  ready = true;
  setLoadingText(lastLoadingText);
});

function setLoadingText(str) {
  console.log(str);
  if(ready) {
    document.getElementById("loading-text").innerText = str + "...";
  } else {
    lastLoadingText = str;
  }
}

function markAvatars(obj, other, property) {
  let nfa = []
  const map = obj.idMap.actualMap;
  for(item of other) {
    const lookup = map[item];
    if(!lookup) {
      nfa.push(item)
      continue;
    }
    lookup[property] = true;
  }
  console.log(`Marked ${other.length-nfa.length} ${property} avatars.`)
  if(nfa.length > 0) {
    // TODO: this happens for avatars are quest/ios only and NOT on pc
    // Since I don't really care about those right now, I am not gonna bother fixing it
    console.error(`Found ${nfa.length} missing from the main list:`)
    console.log(nfa)
  }
}

function decodeAvatarId(crypt, iv) {
  for (var i = crypt.length - 1; i >= 0; i--) {
    const k = crypt[i] ^ crypt[(i + crypt.length - 1) % crypt.length] ^ iv[i];
    crypt[i] = (k);
  }

  let decrypt = Array.from(crypt).map(x=>x.toString(16).padStart(2,"0")).join("").split("").reverse();
  decrypt.splice(8, 0, '-');
  decrypt.splice(13, 0, '-');
  decrypt.splice(18, 0, '-');
  decrypt.splice(23, 0, '-');
  return "avtr_" + decrypt.join("");
}

class Reader {
  constructor(uint8Array) {
    this.data = uint8Array;
    this.position = 0;
  }

  readByte() {
    if (this.position >= this.data.length) {
      throw new Error("Attempted to read beyond end of data.");
    }
    return this.data[this.position++];
  }

  readBytes(amount) {
    if (this.position + amount > this.data.length) {
      throw new Error("Attempted to read beyond end of data.");
    }
    const bytes = this.data.slice(this.position, this.position + amount);
    this.position += amount;
    return bytes;
  }

  readIntArray(n) {
    const totalBytes = n * 4;
    if (this.position + totalBytes > this.data.length) {
      throw new Error("Attempted to read beyond end of data.");
    }

    const view = new DataView(this.data.buffer, this.data.byteOffset + this.position, totalBytes);
    const result = new Int32Array(n);

    for (let i = 0; i < n; i++) {
      result[i] = view.getInt32(i * 4, true); // true = little-endian
    }

    this.position += totalBytes;
    return result;
  }
  
  readInt24() {
    if(this.position + 3 > this.data.length)
      throw new Error("Attempted to read beyond end of data.");

    const bytes = this.readBytes(3);
    return (bytes[0]<<16) | (bytes[1]<<8) | bytes[2];
  }
  
  remaining() {
    return this.data.length - this.position;
  }
}

const staticBytes = [208,29,107,36,251,69,122,14,67,204,171,246,106,38,183,224];

async function getPrismicObj(url) {
  setLoadingText("Downloading avatar database");
  var response = await fetch(url);
  var content = new Reader(new Uint8Array(await response.arrayBuffer()));

  setLoadingText("Parsing avatar database");
  var avatar_data = {};
  
  if(content.data.length == 0) throw new Error("Data has length zero");
  if(String.fromCodePoint(...content.readBytes(3)) !== "PAS") throw new Error("PAS Header not found");
  var _ = content.readBytes(2); // first byte -> platform (7 pc 4 quest 2 ios), second byte -> no clue, probably format version or sth
  
  avatar_data.avatarCount = content.readInt24();
  avatar_data.authorCount = content.readInt24();
  const dateArr = content.readBytes(2);
  const dateNum = ((dateArr[0] << 8) + dateArr[1]) >> 3;
  const year = ((dateNum >> 9) + 16).toString().padStart(2,"0");
  const month = ((dateNum >> 5) & 15).toString().padStart(2,"0");
  const day = (dateNum & 31).toString().padStart(2,"0");
  avatar_data.lastUpdate = `20${year}-${month}-${day}`;
  avatar_data.entries = [];
  avatar_data.idMap = {};
  // devtools crashes otherwise
  avatar_data.idMap.actualMap = {};

  const fileAvatars = content.readInt24();
  const fileAuthors = content.readInt24(); // in the code but like it does nothing??

  const flagSize = content.readByte();
  const randomBytes = content.readBytes(16);
  const dynamicBytes = randomBytes.map((e,i)=> e^staticBytes[i]);
  const dataSize = fileAvatars * 16;
  const avatarIds = content.readBytes(dataSize);
  const flagDataSize = fileAvatars * flagSize;
  const flags = content.readIntArray(fileAvatars); // If flagsize != 4 shit will break, but so will the vrc world
  const authorIds = content.readIntArray(fileAvatars);
  const decoder = new TextDecoder("utf-8");
  const strings = decoder.decode(new Uint8Array(content.readBytes(content.remaining()))).split("\n");
  
  if(strings.length < 2) throw new Error("Malformed string block");

  const authorNames = strings[0].split("\r");
  const avatarNames = strings[1].split("\r");

  for(var i = 0; i < fileAvatars; i++) {
    var obj = {};
    const f = flags[i];
/*
       Platform:
          1 - PC
          2 - Quest
          4 - IOS

       Impostor:
          1 - PC
          2 - Quest
          4 - IOS

       PC Rating:
          0 - Unknown
          1 - Excellent
          2 - Good
          3 - Medium
          4 - Poor
          5 - Very Poor

       Quest Rating:
          0 - Unknown
          1 - Excellent
          2 - Good
          3 - Medium
          4 - Poor
          5 - Very Poor

       IOS Rating:
          0 - Unknown
          1 - Excellent
          2 - Good
          3 - Medium
          4 - Poor
          5 - Very Poor

       Content Warnings:
          1 - Sexually suggestive
          2 - Adult Language
          4 - Graphic Violence
          8 - Excessive Gore
          16 - Extreme Horror

        Style Filter:
          1 - Pop Culture
          2 - Furry
          4 - Sci-Fi
          8 - Anime
          16 - Cartoon
          32 - Objects
          64 - Human
          128 - Realistic
          256 - Animal
          512 - Fantasy
          1024 - Fashion

        Marketplace:
          0 - Not in Marketplace
          1 - In Marketplace
        */

        const avatarFlags = [
            (f >> 29) & 7, // Platform
            (f >> 26) & 7, // Impostor
            (f >> 17) & 7, // PC Rating
            (f >> 20) & 7, // Quest Rating
            (f >> 23) & 7, // IOS Rating
            (f >> 12) & 31, // Content Warnings
            (f >> 1) & 2047, // Style Filter
            (f) & 1 // Marketplace
        ];

    const avatarId = decodeAvatarId(avatarIds.slice(i * 16, (i * 16) + 16), dynamicBytes);
    const nameDesc = avatarNames[i].split("\t");
    obj.name = nameDesc[0].split("").reverse().join("");
    obj.author = authorNames[authorIds[i] & 524287].split("").reverse().join("");
    obj.description = nameDesc[1]?.split("")?.reverse()?.join("");
    obj.quest = false;
    obj.ios = false;
    avatar_data.idMap.actualMap[avatarId] = obj;
    avatar_data.entries.push(obj);
    obj.avatrId = avatarId;
    obj.flags = avatarFlags;
  }

  return avatar_data;
}

async function getAuxPrismicObj(url) {
  var response = await fetch(url);
  var content = new Reader(new Uint8Array(await response.arrayBuffer()));

  if(content.data.length == 0) throw new Error("Data has length zero");
  if(String.fromCodePoint(...content.readBytes(3)) !== "PAS") throw new Error("PAS Header not found");
  var _ = content.readBytes(
    2 //platform 
    + 3 //avatars
    + 3 //authors
    + 2 //date
  );
  var fileAvatars = content.readInt24();
  var _ = content.readBytes(
    3 // fileAuthors
    + 1 // flagSize
  );
  var ids = new Array(fileAvatars)
  var dynamicBytes = content.readBytes(16).map((e,i)=> e^staticBytes[i]);
  var avatarIds = content.readBytes(fileAvatars * 16);
  for (var i = 0; i < fileAvatars; i++) {
    ids[i] = decodeAvatarId(avatarIds.slice(i*16,(i*16)+16), dynamicBytes);
  }

  return ids;
}

async function fetchAvatarData() {
  var main;
  var quest;
  var ios;

  setLoadingText("Checking cache")

  var gistId = urls[0].match(/\/([^\/]+)\/raw/)[1];
  var commitsUrl = `https://api.github.com/gists/${gistId}/commits`;
  var entry = await getData("cached_data", gistId + "_commit");
  console.log("Loaded db entry");

  var gistVersion = null;
  var response = await fetch(commitsUrl);
  if(response.status == 200) {
    var commits = await response.json();
    gistVersion = commits[0].version
    console.log("gist version: " + gistVersion)
  }else{
    console.log("github hates u i guess")
  }

  try {
    if(entry != null && gistVersion == entry.tag) {
      const meta = (await getData("cached_data", gistId+"_meta")).metadata;
      meta.entries = [];
      for(var i =0 ; i < meta.partCount; i++) {
        const chunk = (await getData("cached_data", gistId+"_"+ i)).chunk;
        meta.entries.push(...chunk);
      }
      searchData = meta;
    } else {
      var arr = await Promise.all([
        getPrismicObj(urls[0]),
        getAuxPrismicObj(urls[1]),
        getAuxPrismicObj(urls[2])
      ]);
      main = arr[0];
      quest = arr[1];
      ios = arr[2];
      
      setLoadingText("Aggregating avatar data");
      markAvatars(main, quest, "quest");
      markAvatars(main, ios, "ios");

      delete main.idMap;

      searchData = main;
      if(gistVersion != null) {
        const blockSize = 100000;
        const partCount = Math.ceil(main.entries.length / blockSize);
        const meta = {
          authorCount: main.authorCount,
          avatarCount: main.avatarCount,
          lastUpdate: main.lastUpdate,
          partCount: partCount
        }
        
        db.transaction(["cached_data"], 'readwrite').objectStore("cached_data").put({id: gistId+"_meta", metadata: meta});
        db.transaction(["cached_data"], 'readwrite').objectStore("cached_data").put({id: gistId+"_commit", tag: gistVersion});
        for(var i = 0; i < partCount; i++) {
          db.transaction(["cached_data"], 'readwrite').objectStore("cached_data").put({id: gistId+"_"+i, chunk: main.entries.slice(blockSize*i, (blockSize*i)+blockSize)});
        }
      }
    }
  }
  catch(e) {
    setLoadingText("Loading failed, reason:\n" + e);
    return;
  }

  document.getElementsByClassName("loader")[0].classList.add("disabled");
  document.getElementById("avi-count").innerText = searchData.avatarCount;
  document.getElementById("author-count").innerText = searchData.authorCount;
  document.getElementById("last-update").innerText = searchData.lastUpdate;
}

function downloadFile(filename, uint8Array) {
  const blob = new Blob([uint8Array], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

function getData(storeName, key) {
  if(db == null) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = db.transaction([storeName]).objectStore(storeName).get(key);

    request.onsuccess = function(event) {
      resolve(request.result);
    };

    request.onerror = function(event) {
      resolve(null);
    };
  });
}

const request = indexedDB.open('prismic_database', 3);

request.onupgradeneeded = function(event) {
  const db = event.target.result;
  let objectStoreNames = db.objectStoreNames;
  for (let i = 0; i < objectStoreNames.length; i++) {
    db.deleteObjectStore(objectStoreNames[i]);
  }
  const tagsStore = db.createObjectStore('cached_data', { keyPath: 'id' });
};
request.onsuccess = function(event) {
  db = event.target.result;
  console.log('Database opened successfully');
  fetchAvatarData();
};
request.onerror = function(event) {
  db = null;
  console.error('Database error:', event.target.errorCode);
  fetchAvatarData();
};
