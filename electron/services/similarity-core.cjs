function popcount32(v){v=v-((v>>>1)&0x55555555);v=(v&0x33333333)+((v>>>2)&0x33333333);return (((v+(v>>>4))&0x0F0F0F0F)*0x01010101)>>>24;}
function hammingHex(a='',b=''){
  const aa=String(a).padStart(16,'0').slice(-16);const bb=String(b).padStart(16,'0').slice(-16);let d=0;
  for(let i=0;i<16;i+=8){const x=(parseInt(aa.slice(i,i+8),16)^parseInt(bb.slice(i,i+8),16))>>>0;d+=popcount32(x);}return d;
}
class BKNode{constructor(value,payload){this.value=value;this.payload=[payload];this.children=new Map();}}
class BKTree{
  constructor(distance=hammingHex){this.distance=distance;this.root=null;}
  add(value,payload){if(!this.root){this.root=new BKNode(value,payload);return;}let node=this.root;while(true){const d=this.distance(value,node.value);if(d===0){node.payload.push(payload);return;}if(!node.children.has(d)){node.children.set(d,new BKNode(value,payload));return;}node=node.children.get(d);}}
  search(value,radius=8){if(!this.root)return[];const out=[];const stack=[this.root];while(stack.length){const node=stack.pop();const d=this.distance(value,node.value);if(d<=radius)out.push({distance:d,value:node.value,payload:node.payload});const lo=d-radius,hi=d+radius;for(const [edge,child] of node.children)if(edge>=lo&&edge<=hi)stack.push(child);}return out;}
}
class UnionFind{constructor(n){this.p=Array.from({length:n},(_,i)=>i);this.r=new Array(n).fill(0);}find(x){while(this.p[x]!==x){this.p[x]=this.p[this.p[x]];x=this.p[x];}return x;}union(a,b){a=this.find(a);b=this.find(b);if(a===b)return;if(this.r[a]<this.r[b])[a,b]=[b,a];this.p[b]=a;if(this.r[a]===this.r[b])this.r[a]+=1;}}
function clusterByHash(rows,{hashKey='hash',threshold=8,maxPairs=10000}={}){
  const tree=new BKTree();const uf=new UnionFind(rows.length);const pairs=[];let pairCount=0;
  for(let i=0;i<rows.length;i++){
    const hash=rows[i]?.[hashKey];if(!hash)continue;
    const matches=tree.search(hash,threshold);
    for(const m of matches){for(const j of m.payload){if(pairCount>=maxPairs)break;uf.union(i,j);pairs.push({a:i,b:j,distance:m.distance});pairCount+=1;}if(pairCount>=maxPairs)break;}
    tree.add(hash,i);
  }
  const groups=new Map();for(let i=0;i<rows.length;i++){const root=uf.find(i);const arr=groups.get(root)||[];arr.push(rows[i]);groups.set(root,arr);}
  return {groups:[...groups.values()].filter(g=>g.length>1),pairs,pairsTruncated:pairCount>=maxPairs};
}
module.exports={hammingHex,BKTree,UnionFind,clusterByHash};
