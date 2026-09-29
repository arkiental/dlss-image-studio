// UI race tests with a deliberately synthetic Tauri transport. Not neural evidence.
import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => {
  window.isTauri = true;
  let width = 1560, height = 1008;
  window.requests = [];
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    transformCallback: () => 1,
    invoke: async (command, args, options) => {
      if (command === 'capabilities') return {gpu:'TEST TRANSPORT',runtime_ready:true,neural_rendering:'Synthetic test transport',neural_diagnostics:{round_trip_ms:20}};
      if (command === 'load_source') { width=+options.headers['x-image-width'];height=+options.headers['x-image-height'];return; }
      if (command === 'process_image') {
        window.requests.push(args);
        const w=width,h=height,tone=args.state.local.tone;
        await new Promise(resolve=>setTimeout(resolve,tone===1.2?300:45));
        if(tone===2)throw Error('Neural runtime unavailable (test)');
        const pixels=new Uint8Array(w*h*4);
        for(let i=0;i<pixels.length;i+=4){pixels[i]=Math.round(tone*100);pixels[i+3]=255;}
        return pixels.buffer;
      }
      return 1;
    }
  };
});
await page.goto('http://127.0.0.1:1420');
const exportButton=page.getByRole('button',{name:'Export to File',exact:true});
await expect(exportButton).toBeEnabled();
await page.getByRole('slider',{name:'Local tone',exact:true}).fill('1.2');
await page.waitForTimeout(35);
await page.getByRole('slider',{name:'Local tone',exact:true}).fill('1.5');
await expect(exportButton).toBeEnabled();
await page.waitForTimeout(400);
const red=()=>page.locator('.main-image').evaluate(c=>c.getContext('2d').getImageData(0,0,1,1).data[0]);
if(await red()!==150)throw Error('An obsolete frame replaced the latest preview');
const zoom=await page.locator('.zoom-panel canvas').evaluate(c=>c.getContext('2d').getImageData(300,210,1,1).data[0]);
if(zoom!==150)throw Error('Zoom differs from main result');
await page.getByRole('slider',{name:'Contrast',exact:true}).fill('35');
await page.getByRole('button',{name:'Natural',exact:true}).click();
await page.getByRole('slider',{name:'Resolution',exact:true}).fill('50');
await expect(exportButton).toBeEnabled();
const latest=await page.evaluate(()=>window.requests.at(-1));
if(latest.state.neural.style!=='Natural'||latest.state.processingResolution!==50||latest.state.contrast!==35)throw Error('Style/resolution mapping failed');
await page.getByRole('slider',{name:'Local tone',exact:true}).fill('2');
await expect(page.getByText('Error: Neural runtime unavailable (test)',{exact:true})).toBeVisible();
await expect(exportButton).toBeDisabled();
await page.getByRole('button',{name:'Reset',exact:true}).click();
await expect(exportButton).toBeEnabled();
if(await red()!==100)throw Error('Reset/recovery failed');
await browser.close();
if(errors.length)throw Error(errors.join('\n'));
console.log('Synthetic transport UI: latest-frame ordering, matching zoom, neural style/resolution mapping, failed-render export blocking, reset/recovery passed');
