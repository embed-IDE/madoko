var Crypto  = require("crypto");
var Fs  	  = require("fs");
var Path    = require("path");
var Promise = require("./client/scripts/promise.js");
var match   = require("minimatch");

var versionLog    = JSON.parse(Fs.readFileSync("../versionlog.json"));

var madokoVersion = JSON.parse(Fs.readFileSync("../package.json")).version;
var appVersion 		= JSON.parse(Fs.readFileSync("package.json")).version;
var options 			= JSON.parse(Fs.readFileSync("cache-config.json"));
var template 			= Fs.readFileSync("cache-template.txt");

function startsWith(s,pre) {
  if (!pre) return true;
  if (!s) return false;
  return (s.substr(0,pre.length) === pre);
}

function endsWith(s,post) {
  if (!post) return true;
  if (!s) return false;
  return (s.substr(-post.length) === post);
}

var _readDirRec	= require("recursive-readdir");
function readDirRec(dir) {
	return new Promise( function(cont) {
		return _readDirRec(dir,cont);
	});
}

function readResources() {
	return readDirRec(options.rootPath).then( function(files) {
		return files.sort().map(function(fname) {
			return (fname ? fname.substr(options.rootPath.length+1).replace(/\\/g,"/") : "");
		}).filter( function(fname) {
			// excludes
			if (options.excludes.some(function(pat) { return match(fname,pat); })) {
				console.log("ignore: excluded: " + fname);
				return false;
			}
			var dir = Path.dirname(fname);
			if (dir && !options.dirs.some(function(d) { return startsWith(dir,d); } )) {
				console.log("ignore: dir not included: " + dir + ": " + fname );
				return false;
			}
			var ext = Path.extname(fname).substr(1);
			if (!ext || !options.exts.some(function(e) { return (ext === e); })) {
				console.log("ignore: ext not included: " + fname );
				return false;
			}
			return true;
		});
	});
}

function readFile(fname) {
	return new Promise( function(cont) {
		return Fs.readFile(fname,function(err,content) {
			if (err) console.trace(err);
			cont(err,content);
		});
	})
}

function createDigest(fnames) {
	var makedigests = fnames.map( function(fname) {
		return readFile(Path.join(options.rootPath,fname)).then( function(content) {
			return { fileName: fname, digest: Crypto.createHash('md5').update(content).digest("hex") };
		});
	});
	return Promise.when(makedigests).then( function(infos) {
		var fdigests = infos.map( function(info) { 
			return (info.fileName + ": " + info.digest);
		}).join("\n");
		Fs.writeFileSync("digests.log", fdigests);
		return Crypto.createHash('md5').update(fdigests).digest("hex");
	});
}

function createCache(fnames,digest) {
	var header = JSON.stringify( {
		version: appVersion,
		madokoVersion: madokoVersion,
		digest: digest,
		date: new Date().toISOString(),
		// log: versionLog.log[0],
	});
	Fs.writeFileSync(Path.join(options.rootPath,"version.json"),header + "\n");
	return [
		"CACHE MANIFEST",
		"#" + header,
		"", 
		template,
		fnames.join("\n"),		
		"",
	].join("\n");
}

Fs.writeFileSync(Path.join(options.rootPath,"versionlog.json"), JSON.stringify(versionLog));
readResources().then( function(fnames) {
	console.log("creating digest...");
	return createDigest(fnames.concat(options.digestOnly)).then( function(digest) {
		console.log("version: " + appVersion);
		console.log("madokoVersion: " + madokoVersion);
		console.log("digest : " + digest);	
		if (madokoVersion !== versionLog.log[0].version) {
			console.log("** warning **: madoko version does not match log version (" + versionLog.log[0].version + ")");
		}
		var cache = createCache(fnames,digest);
		Fs.writeFileSync(Path.join(options.rootPath,"madoko.appcache"),cache);
		console.log("done (" + fnames.length + " files)" );
	});	
}, function(err) {
	console.trace(err);
});