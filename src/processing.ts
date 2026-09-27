import type{StudioState}from'./state';
// Browser preview fallback only. Native releases process the same equations through D3D12.
export function processPixels(input:ImageData,state:StudioState):ImageData{
 const out=new ImageData(new Uint8ClampedArray(input.data),input.width,input.height),d=out.data,src=input.data;
 const linear=(x:number)=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);
 const srgb=(x:number)=>x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055;
 const angle=state.hue*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),r=state.local.region;
 for(let y=0;y<input.height;y++)for(let x=0;x<input.width;x++){
  const i=(y*input.width+x)*4;let rgb=[linear(src[i]/255),linear(src[i+1]/255),linear(src[i+2]/255)];
  rgb=rgb.map(v=>Math.pow(Math.max(0,(v-.18)*(1+state.contrast/100)+.18)*Math.pow(2,state.brightness/50),Math.pow(2,-state.gamma/100)));
  const l=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722,spread=Math.max(...rgb)-Math.min(...rgb),sat=1+state.saturation/100+state.vibrance/100*(1-Math.min(1,spread));
  rgb=rgb.map(v=>l+(v-l)*sat);
  const [a,b,e]=rgb;rgb=[(.299+.701*c+.168*s)*a+(.587-.587*c+.330*s)*b+(.114-.114*c-.497*s)*e,(.299-.299*c-.328*s)*a+(.587+.413*c+.035*s)*b+(.114-.114*c+.292*s)*e,(.299-.300*c+1.250*s)*a+(.587-.588*c-1.050*s)*b+(.114+.886*c-.203*s)*e];
  if(x/input.width>=r.x&&x/input.width<=r.x+r.width&&y/input.height>=r.y&&y/input.height<=r.y+r.height){
   const edge=Math.min((x/input.width-r.x)/r.width,(r.x+r.width-x/input.width)/r.width,(y/input.height-r.y)/r.height,(r.y+r.height-y/input.height)/r.height);const mask=Math.min(1,Math.max(0,edge*20));
   rgb=rgb.map((v,k)=>{const left=linear(src[(y*input.width+Math.max(0,x-1))*4+k]/255),right=linear(src[(y*input.width+Math.min(input.width-1,x+1))*4+k]/255);return v+mask*state.local.intensity*(state.local.tone*.1+(state.local.structure-.8)*(linear(src[i+k]/255)-(left+right)/2));});
  }
  for(let k=0;k<3;k++)d[i+k]=Math.round(Math.max(0,Math.min(1,srgb(Math.max(0,rgb[k]))))*255);
 }return out;
}
