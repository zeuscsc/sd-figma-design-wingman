let url="";
const default_bad_prompt="text, logo, signature, over-saturated, over-exposed, amateur, extra limbs, extra barrel, b&w, close-up, duplicate, mutilated, extra fingers, mutated hands, deformed, blurry, bad proportions, extra limbs, cloned face, out of frame, bad anatomy, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, mutated hands, fused fingers, too many fingers, long neck, tripod, tube, ugly, tiling, poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, mutation, mutated, extra limbs, extra legs, extra arms, disfigured, deformed, cross-eye, body out of frame, blurry, bad art, bad anatomy, nfixer"
figma.showUI(__html__, { width: 320, height: 720 });
figma.ui.onmessage = async msg => {
  if (msg.type === 'txt2img') {
    let width = msg.width;
    let height = msg.height;
    let style = msg.style;
    url= msg.url;
    txt2img(msg.prompt, width, height, style);
  }
  if (msg.type==="auto_mask"||msg.type==="prompt_mask"||msg.type==="vectors_2_image"){
    let width = figma.currentPage.selection[0].width;
    let height = figma.currentPage.selection[0].height;
    let style = msg.style;
    let imageUrl=msg.imageUrl;
    let prompt=msg.prompt;
    let vectors_guidance=msg.vectors_guidance;
    url= msg.url;
    if(msg.type==="auto_mask")auto_mask(imageUrl,"",width,height,style);
    if(msg.type==="prompt_mask") prompt_mask(imageUrl,prompt,width,height,style);
    if(msg.type==="vectors_2_image")vectors_2_image(imageUrl,prompt,width,height,style,vectors_guidance);
  }
  if(msg.type==="render_sketch"){
    let width = figma.currentPage.selection[0].width;
    let height = figma.currentPage.selection[0].height;
    let style = msg.style;

  }

  if (msg.type === 'create_image_node') {
    create_image_node(msg.original_task,msg.byte_array);
  }
  if (msg.type === 'get_selected_image') {
    const original_task=msg.original_task;
    const imageData=await get_selected_image();
    figma.ui.postMessage({ type: 'image_selected',original_task, data: imageData });
  }
  if (msg.type === 'create_node_from_svg') {
    console.log(msg.svgstr)
    const svgString = msg.svgstr;
    const width = msg.width;
    const height = msg.height;
    const node = figma.createNodeFromSvg(svgString);
    if(figma.currentPage.selection.length>0){
      node.x=figma.currentPage.selection[0].x+100;
      node.y=figma.currentPage.selection[0].y+100;
    }
    node.resize(width, height);
    figma.currentPage.appendChild(node);
    figma.currentPage.selection = [node];
  }
  if (msg.type === 'find_items') {
    if(figma.currentPage.selection.length>0)figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection);
  }
  if (msg.type === 'cancel')
    figma.closePlugin();
};
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({ type: 'sync_img2img_ui', selected_nodes_count: selection.length });
});
function initialize(){
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({ type: 'on_initialized', selected_nodes_count: selection.length });
}
initialize()

function api_results(original_task:string,base64: string) {
  figma.ui.postMessage({ type: 'api_results',original_task:original_task, data: base64 });
}
function svg_results(svg: string, width: number = 512, height: number = 512) {
  const nodes: SceneNode[] = [];
  console.log(svg)
  const svgNode = figma.createNodeFromSvg(svg);
  svgNode.resize(width, height);
  nodes.push(svgNode);
  figma.currentPage.selection = nodes;
  figma.viewport.scrollAndZoomIntoView(nodes);
  figma.ui.postMessage({ type: 'done' });
}
async function txt2img(prompt: string, width: number = 512, height: number = 512, style: string = "default") {
  prompt = get_styled_prompt(prompt, style);
  let query: any = {
    "prompt": prompt,
    "negative_prompt": default_bad_prompt,
    "steps": 30,
    "sampler_index": "Euler a",
    "cfg_scale": 7,
    "width": width,
    "height": height,
  }
  let res = await fetch(`${url}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(query)
  });
  let data = await res.json();
  api_results("txt2img",data['images'][0])
}
async function auto_mask(imageUrl:string,prompt:string,width: number = 512, height: number = 512, style: string = "default") {
  prompt = get_styled_prompt(prompt, style);
  let query: any = {
    "image_str": imageUrl,
    "alpha_matting":false,
    "alpha_matting_foreground_threshold":240,
    "alpha_matting_background_threshold":10,
    "alpha_matting_erode_size":10,
    "session_name":"u2net",
    "only_mask":false,
    "post_process_mask":true,
  }
  let res = await fetch(`${url}/auto_mask/remove-background`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(query)
  });
  let data = await res.json();
  api_results("auto_mask",data['mask'])
  
}
async function prompt_mask(imageUrl:string,prompt:string,width: number = 512, height: number = 512, style: string = "default"){
  prompt = get_styled_prompt(prompt, style);
  let query: any = {
    "image_str": imageUrl,
    "prompts":prompt,
    "neg_prompts":"white background",
    "only_mask":false,
    "threshold":0.4,
    "mask_blur_median":11,
    "mask_blur_gaussian":11,
  }
  let res = await fetch(`${url}/prompt_mask/remove-background`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(query)
  });
  let data = await res.json();
  api_results("prompt_mask",data['mask'])
  
}
async function vectors_2_image(imageUrl:string,prompt:string,width: number = 512, height: number = 512, style: string = "default",vectors_guidance:number=1) {
  prompt = get_styled_prompt(prompt, style);
  let query: any = {
    "prompt":prompt,
    "negative_prompt": default_bad_prompt,
    "steps": 30,
    "sampler_index": "Euler a",
    "cfg_scale": 7,
    "width": width,
    "height": height,
    "alwayson_scripts": {
      "controlnet": {
        "args": [
          {
            "input_image":`data:image/png;base64,${imageUrl}`,
            "module": "scribble",
            "model": "control_sd21_scribble-sd21-safe [6e34c018]",
            "guessmode":false,
            "weight":Number(vectors_guidance),
          }
        ]
      }
    }
  }
  let res = await fetch(`${url}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(query)
  });
  let data = await res.json();
  api_results("vectors_2_image",data['images'][0])
  
}
function get_styled_prompt(prompt:string,style:string){
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
  return prompt;
}

async function create_image_node(original_task:string,byte_array: Uint8Array) {
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
  if(figma.currentPage.selection.length>0){
    imageNode.x=figma.currentPage.selection[0].x+100;
    imageNode.y=figma.currentPage.selection[0].y+100;
    // nodes.push(figma.currentPage.selection[0])
  }
  // nodes.push(imageNode);
  // figma.currentPage.selection = nodes;
  // figma.viewport.scrollAndZoomIntoView(nodes);
  figma.ui.postMessage({ original_task,type: 'done' });
}
async function get_selected_image() {
  if (figma.currentPage.selection.length === 0) return
  return await figma.currentPage.selection[0].exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } })
}
function encodeURIComponent(input: string): string {
  const hexChars = '0123456789ABCDEF';
  let output = '';

  for (let i = 0; i < input.length; i++) {
    const charCode = input.charCodeAt(i);

    if (
      (charCode >= 65 && charCode <= 90) || // A-Z
      (charCode >= 97 && charCode <= 122) || // a-z
      (charCode >= 48 && charCode <= 57) || // 0-9
      charCode === 45 || // -
      charCode === 95 || // _
      charCode === 46 || // .
      charCode === 126 // ~
    ) {
      output += input[i];
    } else {
      const hexCode = charCode.toString(16).toUpperCase();
      output += `%${hexCode.length === 1 ? '0' : ''}${hexCode}`;
    }
  }

  return output;
}
function btoa(input: string): string {
  const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let char1, char2, char3;
  let enc1, enc2, enc3, enc4;
  let i = 0;

  input = encodeURIComponent(input);

  do {
    char1 = input.charCodeAt(i++);
    char2 = input.charCodeAt(i++);
    char3 = input.charCodeAt(i++);

    enc1 = char1 >> 2;
    enc2 = ((char1 & 3) << 4) | (char2 >> 4);
    enc3 = ((char2 & 15) << 2) | (char3 >> 6);
    enc4 = char3 & 63;

    if (isNaN(char2)) {
      enc3 = enc4 = 64;
    } else if (isNaN(char3)) {
      enc4 = 64;
    }

    output += base64Chars.charAt(enc1) + base64Chars.charAt(enc2) + base64Chars.charAt(enc3) + base64Chars.charAt(enc4);
  } while (i < input.length);

  return output;
}
function atob(input: string): string {
  const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let char1, char2, char3;
  let enc1, enc2, enc3, enc4;
  let i = 0;
  input = input.replace(/\s/g, '');
  const padding = input.length % 4;
  if (padding > 0) {
    input += '='.repeat(4 - padding);
  }
  do {
    enc1 = base64Chars.indexOf(input.charAt(i++));
    enc2 = base64Chars.indexOf(input.charAt(i++));
    enc3 = base64Chars.indexOf(input.charAt(i++));
    enc4 = base64Chars.indexOf(input.charAt(i++));

    char1 = (enc1 << 2) | (enc2 >> 4);
    char2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    char3 = ((enc3 & 3) << 6) | enc4;

    output += String.fromCharCode(char1);

    if (enc3 !== 64) {
      output += String.fromCharCode(char2);
    }
    if (enc4 !== 64) {
      output += String.fromCharCode(char3);
    }
  } while (i < input.length);

  return output;
}
function base64ToUint8Array(base64:string) {
  var binary_string = atob(base64);
  var len = binary_string.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return new Uint8Array(bytes.buffer);
}