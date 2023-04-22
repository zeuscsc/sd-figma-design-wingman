let url = "";
let api_key="";
let used_base_model="2.1/rmadaMergeSD21768_v60.safetensors [7da43996bb]";
let control_net_for_sketch="control_sd21_scribble-sd21-safe [6e34c018]";
let currentSeed="-1";
const IDEAL_SIZE = 768;
const default_bad_prompt = "nfixer,text, logo, signature, over-saturated, over-exposed, amateur, extra limbs, extra barrel, b&w, close-up, duplicate, mutilated, extra fingers, mutated hands, deformed, blurry, bad proportions, extra limbs, cloned face, out of frame, bad anatomy, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, mutated hands, fused fingers, too many fingers, long neck, tripod, tube, ugly, tiling, poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, mutation, mutated, extra limbs, extra legs, extra arms, disfigured, deformed, cross-eye, body out of frame, blurry, bad art, bad anatomy, "
figma.showUI(__html__, { width: 320, height: 720 });
figma.ui.onmessage = async msg => {
  if(msg.type==="update_api_key"){
    api_key=msg.api_key;
    figma.clientStorage.setAsync("api_key",api_key);
  }
  if(msg.type==="check_availibility"){
    url = msg.url;
    used_base_model=await get_loaded_model();
    await control_net_for_sketch_picker();
    figma.clientStorage.setAsync("url",url);
  }
  if (msg.type === 'txt2img') {
    let width = msg.width;
    let height = msg.height;
    let style = msg.style;
    let seed=msg.seed;
    currentSeed=seed;
    url = msg.url;
    txt2img(msg.prompt, width, height, style,seed);
  }
  if (msg.type === "auto_mask" || msg.type === "prompt_mask" || msg.type === "vectors_2_image") {
    let width = figma.currentPage.selection[0].width;
    let height = figma.currentPage.selection[0].height;
    [width,height]=keep_aspect_ratio(width,height);
    let style = msg.style;
    let imageUrl = msg.imageUrl;
    let prompt = msg.prompt;
    let vectors_guidance = msg.vectors_guidance;
    let mask_only = msg.mask_only;
    let seed=msg.seed;
    currentSeed=seed;
    url = msg.url;
    if (msg.type === "auto_mask") auto_mask(imageUrl, "", width, height, style,mask_only);
    if (msg.type === "prompt_mask") prompt_mask(imageUrl, prompt, width, height, style,mask_only);
    if (msg.type === "vectors_2_image") vectors_2_image(imageUrl, prompt, width, height, style, vectors_guidance,seed);
  }
  if(msg.type==="canny"){
    get_canny(msg.imageUrl,msg.url,msg.canny_low_threshold,msg.canny_high_threshold);
  }

  if (msg.type === 'create_image_node') {
    create_image_node(msg.original_task, msg.byte_array);
  }
  if (msg.type === 'get_selected_image') {
    const original_task = msg.original_task;
    let imageData = await get_selected_image();
    figma.ui.postMessage({ type: 'image_selected', original_task, data: imageData });
  }
  if (msg.type === 'create_node_from_svg') {
    const svgString = msg.svgstr;
    const width = msg.width;
    const height = msg.height;
    const node = figma.createNodeFromSvg(svgString);
    if (figma.currentPage.selection.length > 0) {
      node.x = figma.currentPage.selection[0].x + 100;
      node.y = figma.currentPage.selection[0].y + 100;
    }
    node.resize(width, height);
    figma.currentPage.appendChild(node);
    figma.currentPage.selection = [node];
  }
  if (msg.type === 'find_items') {
    if (figma.currentPage.selection.length > 0) figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection);
  }
  if (msg.type === 'cancel')
    figma.closePlugin();
};
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({ type: 'sync_img2img_ui', selected_nodes_count: selection.length });
});
async function initialize() {
  api_key=await figma.clientStorage.getAsync('api_key');
  url=await figma.clientStorage.getAsync('url');
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({ type: 'on_initialized', selected_nodes_count: selection.length,api_key,url });
}
initialize()

function api_results(original_task: string, base64: string) {
  figma.ui.postMessage({ type: 'api_results', original_task: original_task, data: base64 });
}
function svg_results(svg: string, width: number = 512, height: number = 512) {
  const nodes: SceneNode[] = [];
  const svgNode = figma.createNodeFromSvg(svg);
  svgNode.resize(width, height);
  nodes.push(svgNode);
  figma.currentPage.selection = nodes;
  figma.viewport.scrollAndZoomIntoView(nodes);
  figma.ui.postMessage({ type: 'done' });
}
async function txt2img(prompt: string, width: number = 512, height: number = 512, style: string = "default"
  ,seed:string="-1") {
  prompt = get_styled_prompt(prompt, style);
  let query: any = {
    "prompt": prompt,
    "negative_prompt": default_bad_prompt,
    "steps": 30,
    "sampler_index": "Euler a",
    "seed": seed,
    "cfg_scale": 7,
    "width": width,
    "height": height,
  }
  let res = await fetch(`${url}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      "Authorization": api_key
    },
    body: JSON.stringify(query)
  });
  let data = await res.json();
  console.log(data)
  api_results("txt2img", data['images'][0])
}
async function auto_mask(imageUrl: string, prompt: string, width: number = 512, height: number = 512, style: string = "default",
  mask_only:boolean=false) {
  prompt = get_styled_prompt(prompt, style);
  let query: any = {
    "image_str": imageUrl,
    "alpha_matting": false,
    "alpha_matting_foreground_threshold": 240,
    "alpha_matting_background_threshold": 10,
    "alpha_matting_erode_size": 10,
    "session_name": "u2net",
    "only_mask": mask_only,
    "post_process_mask": true,
  }
  let res = await fetch(`${url}/auto_mask/remove-background`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      "Authorization": api_key
    },
    body: JSON.stringify(query)
  });
  let data = await res.json();
  api_results("auto_mask", data['mask'])

}
async function prompt_mask(imageUrl: string, prompt: string, width: number = 512, height: number = 512, style: string = "default"
  ,mask_only:boolean=false) {
  prompt = get_styled_prompt(prompt, style);
  let query: any = {
    "image_str": imageUrl,
    "prompts": prompt,
    "neg_prompts": "white background",
    "only_mask": mask_only,
    "threshold": 0.4,
    "mask_blur_median": 11,
    "mask_blur_gaussian": 11,
  }
  let res = await fetch(`${url}/prompt_mask/remove-background`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      "Authorization": api_key
    },
    body: JSON.stringify(query)
  });
  let data = await res.json();
  api_results("prompt_mask", data['mask'])

}
async function vectors_2_image(imageUrl: string, prompt: string, width: number = 512, height: number = 512, style: string = "default", 
  vectors_guidance: number = 1,seed:string="-1") {
  prompt = get_styled_prompt(prompt, style);
  let query: any = {
    "prompt": prompt,
    "negative_prompt": default_bad_prompt,
    "steps": 30,
    "sampler_index": "Euler a",
    "cfg_scale": 7,
    "width": width,
    "height": height,
    "seed": seed,
    "alwayson_scripts": {
      "controlnet": {
        "args": [
          {
            "input_image": `data:image/png;base64,${imageUrl}`,
            "module": "scribble",
            "model": control_net_for_sketch,
            "guessmode": false,
            "weight": Number(vectors_guidance),
          }
        ]
      }
    }
  }
  let res = await fetch(`${url}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      "Authorization": api_key
    },
    body: JSON.stringify(query)
  });
  let data = await res.json();
  api_results("vectors_2_image", data['images'][0])

}
function get_styled_prompt(prompt: string, style: string) {
  switch (style) {
    case "photo":
      prompt = `.photo realistic, ultra details, natural light,
      ${prompt}
      ,  octane, dimly lit, low key,
      , digital art, (photo,
      sony a7, 50 mm, hyperrealistic, big depth of field, colors, hyperdetailed, hyperrealistic) , ((moody lighting)), (ambient light)
      `;
      break;
    case "icon":
      prompt = `${prompt}
        ,(((lineart))),((low detail)),(simple),high contrast,sharp,2 bit,(((centered vector graphic logo))),negative space,stencil,trending on dribbble`
      break;
    case "sticker":
      prompt = `${prompt}
      ,(Die-cut sticker, kawaii sticker,contrasting background, illustration minimalism, vector, pastel colors)
      `
      break;
    case "anime":
      prompt = `${prompt}
      ,(((lineart))),((low detail)),(simple),high contrast,sharp,2 bit,(((gothic ink on paper))),H.P. Lovecraft,Arthur Rackham
      `
      break;
    case "studio":
      prompt = `.photo realistic, ultra details, natural light,
      ${prompt}
      ,(rim lighting,:1.4) two tone lighting,  octane, unreal, dimly lit, low key,
      , digital art, (photo, studio lighting, hard light, high contrast lighting
      sony a7, 50 mm, hyperrealistic, big depth of field, concept art, colors, hyperdetailed, hyperrealistic) , ((moody lighting)), (fog), (ambient light)
      `;
      break;
    default:
      break;
  }
  if(/scifi/.test(prompt)) prompt=`fking_scifi_v2,${prompt}`
  
  return prompt;
}

async function get_canny(imageUrl: string,url:string,canny_low_threshold:number,canny_high_threshold:number) {
  let query = {
    image_str: imageUrl,
    annotator_resolution: 512,
    canny_low_threshold: canny_low_threshold,
    canny_high_threshold: canny_high_threshold,
  }
  let res = await fetch(`${url}/figma/canny`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      "Authorization": api_key
    },
    body: JSON.stringify(query)
  });
  let data = await res.json();
  api_results("get_canny", data['image'])
}
async function create_image_node(original_task: string, byte_array: Uint8Array) {
  // const nodes: SceneNode[] = [];
  const imageNode = figma.createRectangle();
  const image = await figma.createImage(byte_array);
  const { width, height } = await image.getSizeAsync()
  imageNode.resize(width, height);
  imageNode.fills = [
    {
      type: 'IMAGE',
      imageHash: image.hash,
      scaleMode: 'FILL'
    }
  ]
  imageNode.name = currentSeed;
  imageNode.x=figma.viewport.center.x-width/2;
  imageNode.y=figma.viewport.center.y-height/2;
  figma.ui.postMessage({ original_task, type: 'done' });
}
async function get_selected_image() {
  if (figma.currentPage.selection.length === 0) return
  return await figma.currentPage.selection[0].exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } })
}
function keep_aspect_ratio(width:number,height:number){
  let ratio=1;
  if (width > height) {
    ratio=IDEAL_SIZE/height;
    height=IDEAL_SIZE;
    width=width*ratio;
    const newHeight = width * (height / width);
    width = width;
    height = newHeight;
  } else {
    ratio=IDEAL_SIZE/width;
    width=IDEAL_SIZE;
    height=height*ratio;
    const newWidth = height * (width / height);
    height = height;
    width = newWidth;
  }
  return [width,height]
}


async function get_loaded_model() {
  if(url==="")return
  let res = await fetch(`${url}/sdapi/v1/options`,{method: 'GET', headers: {"Authorization":api_key}});
  let options = await res.json();
  return options['sd_model_checkpoint'];
}
async function control_net_for_sketch_picker(){
  if(url==="")return
  let res = await fetch(`${url}/controlnet/model_list`,{method: 'GET', headers: {"Authorization":api_key}});
  let model_list = await res.json();
  model_list=model_list['model_list'];
  for(let model_name of model_list){
    let controlNetAvailable=false
    if(/1\.5\//.test(used_base_model)){ controlNetAvailable= /sd15/.test(model_name) && /scribble/.test(model_name);
    }else if(/2\.1\//.test(used_base_model)){ controlNetAvailable= /sd21/.test(model_name) && /scribble/.test(model_name);
    }
    if (controlNetAvailable) {
      control_net_for_sketch = model_name;
      return
    }
  }
}