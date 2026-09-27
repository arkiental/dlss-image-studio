import{describe,it,expect}from'vitest';import{defaults,presets,clamp,imageFit,moveRegion,exportName}from'../src/state';
describe('studio state',()=>{
 it('has reproducible independent defaults',()=>{const a=defaults();a.local.intensity=0;expect(defaults().local.intensity).toBe(1.3);expect(defaults().local.structure).toBe(.8)});
 it('round trips persisted state',()=>expect(JSON.parse(JSON.stringify(defaults()))).toEqual(defaults()));
 it('presets remain distinct and neutral is identity',()=>{expect(Object.values(presets.neutral).every(x=>x===0)).toBe(true);expect(presets.cinematic).not.toEqual(presets.natural)});
 it('clamps slider endpoints and invalid input',()=>{expect(clamp(0,1,100)).toBe(1);expect(clamp(120,1,100)).toBe(100);expect(clamp(NaN,1,100)).toBe(1)});
 it('fits landscape and portrait without distortion',()=>{expect(imageFit(200,100,100,100)).toEqual({x:0,y:25,width:100,height:50,scale:.5});expect(imageFit(100,200,100,100)).toEqual({x:25,y:0,width:50,height:100,scale:.5})});
 it.each([1,1.25,1.5,2])('preserves image-space movement at DPI scale %s',dpi=>{const r={x:.1,y:.2,width:.2,height:.3};const next=moveRegion(r,10*dpi,20*dpi,100*dpi,100*dpi);expect(next.x).toBeCloseTo(.2);expect(next.y).toBeCloseTo(.4)});
 it('constrains local rectangle to source bounds',()=>{const r=moveRegion({x:.1,y:.1,width:.2,height:.3},1000,-1000,100,100);expect(r.x).toBe(.8);expect(r.y).toBe(0)});
 it('names exports deterministically',()=>{expect(exportName('car:front','cinematic')).toBe('car_front-cinematic.png');expect(exportName('..','neutral')).toBe('image-neutral.png')});
});
