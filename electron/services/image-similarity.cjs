const path=require('path');
const {clusterByHash,hammingHex}=require('./similarity-core.cjs');
const {mapLimit}=require('./duplicate-finder.cjs');
const IMAGE_EXTS=new Set(['.jpg','.jpeg','.png','.webp','.bmp','.gif']);
function grayscaleFromBitmap(buffer,width=9,height=8){
  const needed=width*height*4;if(!Buffer.isBuffer(buffer)||buffer.length<needed)throw Object.assign(new Error('Bitmap payload is incomplete'),{code:'IMAGE_BITMAP_INVALID'});
  const gray=[];for(let i=0;i<width*height;i++){const o=i*4;gray.push(Math.round((Number(buffer[o])+Number(buffer[o+1])+Number(buffer[o+2]))/3));}return gray;
}
function dHashFromGray(gray,width=9,height=8){
  if(!Array.isArray(gray)||gray.length<width*height||width<2)throw Object.assign(new Error('Invalid grayscale grid'),{code:'DHASH_INPUT_INVALID'});
  let bits='';for(let y=0;y<height;y++){for(let x=0;x<width-1;x++)bits+=gray[y*width+x]>gray[y*width+x+1]?'1':'0';}
  return BigInt(`0b${bits||'0'}`).toString(16).padStart(16,'0').slice(-16);
}
async function defaultLoadGray(filePath){
  let nativeImage;try{({nativeImage}=require('electron'));}catch{throw Object.assign(new Error('Electron nativeImage is unavailable'),{code:'IMAGE_DECODER_UNAVAILABLE'});}
  const img=nativeImage.createFromPath(filePath);if(!img||img.isEmpty())throw Object.assign(new Error('Image could not be decoded'),{code:'IMAGE_DECODE_FAILED'});
  const resized=img.resize({width:9,height:8,quality:'good'});return grayscaleFromBitmap(resized.toBitmap(),9,8);
}
function confidenceForDistance(distance,threshold=8){const d=Math.max(0,Number(distance||0));if(d<=2)return .98;if(d<=4)return .93;if(d<=6)return .86;if(d<=threshold)return .78;return .5;}
async function findSimilarImages(files=[], {threshold=8,maxImages=12000,maxGroups=1000,maxPairs=12000,concurrency=4,loadGray=defaultLoadGray,resolveHash=null,onProgress}={}){
  const candidates=files.filter(f=>f?.path&&IMAGE_EXTS.has(String(f.ext||path.extname(f.path)).toLowerCase())).slice(0,maxImages);const errors=[];let processed=0;
  const processedRows=await mapLimit(candidates,Math.max(1,Math.min(8,Number(concurrency||4))),async file=>{try{const dhash=resolveHash?await resolveHash(file):dHashFromGray(await loadGray(file.path,file));return dhash?{...file,dhash}:null;}catch(error){errors.push({path:file.path,error:error.code||error.message});return null;}finally{processed+=1;if(processed%25===0||processed===candidates.length)onProgress?.({processed,total:candidates.length,errors:errors.length});}});
  const rows=processedRows.filter(Boolean);
  const clustered=clusterByHash(rows,{hashKey:'dhash',threshold,maxPairs});
  const groups=clustered.groups.map((group,idx)=>{
    let maxDistance=0,minDistance=64,totalDistance=0,pairs=0;
    for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){const d=hammingHex(group[i].dhash,group[j].dhash);maxDistance=Math.max(maxDistance,d);minDistance=Math.min(minDistance,d);totalDistance+=d;pairs+=1;}
    const avgDistance=pairs?totalDistance/pairs:0;return {id:`simimg-${idx+1}`,files:group,maxDistance,minDistance:minDistance===64?0:minDistance,avgDistance:Number(avgDistance.toFixed(2)),confidence:confidenceForDistance(avgDistance,threshold),evidence:[`dHash 64-bit`, `میانگین فاصله Hamming: ${avgDistance.toFixed(2)}`,`آستانه: ${threshold}`]};
  }).sort((a,b)=>b.files.length-a.files.length||a.avgDistance-b.avgDistance).slice(0,maxGroups);
  return {groups,groupsTotal:clustered.groups.length,groupsTruncated:clustered.groups.length>groups.length,pairsTruncated:clustered.pairsTruncated,processedImages:rows.length,candidateImages:candidates.length,errors:errors.slice(0,200),errorsTotal:errors.length,threshold};
}
module.exports={IMAGE_EXTS,grayscaleFromBitmap,dHashFromGray,defaultLoadGray,findSimilarImages,confidenceForDistance};
