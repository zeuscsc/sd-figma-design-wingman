const RENDER_MODEL_TYPE = "render";
const INPAINT_MODEL_TYPE = "inpaint";
const IDEAL_SIZE = 768;
class Cache {
  type: string = "";
  api_key: string = "";
  url: string = "";
  used_base_model: string = "2.1/rmadaMergeSD21768_v70.safetensors [b346aa1648]";
  control_net_for_sketch = "control_sd21_scribble-sd21-safe [6e34c018]";
  model_type: string = RENDER_MODEL_TYPE;
  prompt: string = "";
  width: number = IDEAL_SIZE;
  height: number = IDEAL_SIZE;
  style: string = "none";
  seed: string = "-1";
  step: number = 30;
  sampler: string = "Euler";
  mask_only: boolean = false;
  vectors_guidance: number = 1;
  canny_high_threshold: number = 200;
  canny_low_threshold: number = 100;
}
class Settings extends Cache {
  static getInstance(cache: Cache) {
    settings = new Settings();
    const merge = Object.assign({}, settings, cache);
    Object.assign(settings, merge);
    return settings;
  }

  async save() {
    await figma.clientStorage.setAsync("settings", JSON.stringify(this));
  }
  async load() {
    let settings_str = await figma.clientStorage.getAsync("settings");
    if (settings_str) {
      let settings = JSON.parse(settings_str);
      Object.assign(this, settings);
    }
  }
  toJson() {
    return JSON.stringify(this);
  }
  getHeaders() {
    return { 'Content-Type': 'application/json', "Authorization": this.api_key };
  }
}
let settings = new Settings();
let cache = new Cache();
const default_bad_prompt = "nfixer,text, logo, signature, over-saturated, over-exposed, amateur, extra limbs, extra barrel, b&w, close-up, duplicate, mutilated, extra fingers, mutated hands, deformed, blurry, bad proportions, extra limbs, cloned face, out of frame, bad anatomy, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, mutated hands, fused fingers, too many fingers, long neck, tripod, tube, ugly, tiling, poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, mutation, mutated, extra limbs, extra legs, extra arms, disfigured, deformed, cross-eye, body out of frame, blurry, bad art, bad anatomy, "
figma.showUI(__html__, { width: 320, height: 720 });
const archiveFigmaUiMessageHandler = async (msg: any) => {
  if (msg.type === "canny") {
    get_canny(msg.imageUrl, msg.canny_low_threshold, msg.canny_high_threshold);
  }

  if (msg.type === 'create_image_node') {
    create_image_node(msg.original_task, msg.byte_array);
  }
  if (msg.type === 'get_selected_image') {
    const original_task = msg.original_task;
    let imageData = await get_selected_image();
    figma.ui.postMessage({ type: 'image_selected', original_task, data: imageData });
  }
  if (msg.type === "get_mask_for_change_background") {
    const original_task = msg.original_task;
    let imageUrl = msg.imageUrl;
    let query: any = {
      "image_str": imageUrl,
      "alpha_matting": false,
      "alpha_matting_foreground_threshold": 240,
      "alpha_matting_background_threshold": 10,
      "alpha_matting_erode_size": 10,
      "session_name": "u2net",
      "only_mask": true,
      "post_process_mask": true,
    }
    let res = await fetch(`${settings.url}/auto_mask/remove-background`, {
      method: 'POST',
      headers: settings.getHeaders(),
      body: JSON.stringify(query)
    });
    let data = await res.json();
    let maskData = data["mask"];
    figma.ui.postMessage({ type: 'image_n_mask_selected', original_task, imageUrl, mask: maskData });
  }
  if (msg.type === 'get_selected_image_n_mask') {
    const original_task = msg.original_task;
    let data = await get_selected_image_n_mask();
    figma.ui.postMessage({ type: 'image_n_mask_selected', original_task, image: data?.image, mask: data?.mask });
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
const figmaUiMessageHandler = async (msg: Cache) => {
  const merge = Object.assign({}, cache, msg, keep_aspect_ratio(cache.width, cache.height));
  Object.assign(cache, merge)
  const type = msg.type;
  cache.used_base_model = await get_loaded_model();
  cache.model_type = get_model_type(cache.used_base_model);
  switch (type) {
    case "check_availibility":
      await control_net_for_sketch_picker();
      break;
    case "txt2img":
      if (cache.model_type !== RENDER_MODEL_TYPE) await select_model_type(RENDER_MODEL_TYPE);
      await txt2img();
      break;
    case "auto_mask":
      await auto_mask();
      break;
    case "prompt_mask":
      await prompt_mask();
      break;
    case "change_background":
      if (cache.model_type !== INPAINT_MODEL_TYPE) await select_model_type(INPAINT_MODEL_TYPE);
      await change_background();
      break;
    case "image_2_vectors":
      await image_2_vectors();
      break;
    case "vectors_2_image":
      if (cache.model_type !== RENDER_MODEL_TYPE) await select_model_type(RENDER_MODEL_TYPE);
      await vectors_2_image();
      break;
    case "find_items":
      if (figma.currentPage.selection.length > 0) figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection);
      break;
  }
  settings = Settings.getInstance(cache);
  await settings.save();
};
figma.ui.onmessage = figmaUiMessageHandler;
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({ type: 'sync_img2img_ui', selected_nodes_count: selection.length });
});
async function initialize() {
  await settings.load();
  const merge = Object.assign({}, cache, settings);
  Object.assign(cache, merge)
  settings = Settings.getInstance(cache);
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({ type: 'on_initialized', selected_nodes_count: selection.length, settings: JSON.stringify(settings) });
}
initialize()
function base64_to_Uint8Array(base64: string) {
  return new Promise<Uint8Array>((resolve) => {
    function handleMessage(msg: any) {
      if (msg.type === "base64_to_Uint8Array_result") {
        figma.ui.onmessage = figmaUiMessageHandler;
        resolve(msg.uint8array);
      }
    }
    figma.ui.onmessage = handleMessage;
    figma.ui.postMessage({ type: "base64_to_Uint8Array", base64 });
  });
}
function Uint8Array_to_base64(uint8array: Uint8Array) {
  return new Promise<string>((resolve) => {
    function handleMessage(msg: any) {
      if (msg.type === "Uint8Array_to_base64_result") {
        figma.ui.onmessage = figmaUiMessageHandler;
        resolve(msg.base64);
      }
    }
    figma.ui.onmessage = handleMessage;
    figma.ui.postMessage({ type: "Uint8Array_to_base64", uint8array });
  });
}
function combine_images(background_url: string, foreground_url: string) {
  return new Promise<string>((resolve) => {
    function handleMessage(msg: any) {
      if (msg.type === "combine_images_result") {
        figma.ui.onmessage = figmaUiMessageHandler;
        resolve(msg.base64);
      }
    }
    figma.ui.onmessage = handleMessage;
    figma.ui.postMessage({ type: "combine_images", background_url, foreground_url });
  });
}
function image_to_svg(base64: string) {
  return new Promise<string>((resolve) => {
    function handleMessage(msg: any) {
      if (msg.type === "image_to_svg_result") {
        figma.ui.onmessage = figmaUiMessageHandler;
        resolve(msg.svgstr);
      }
    }
    figma.ui.onmessage = handleMessage;
    figma.ui.postMessage({ type: "image_to_svg", base64 });
  });
}
async function select_model_type(model_type: string) {
  switch (model_type) {
    case INPAINT_MODEL_TYPE:
      await change_model("1.5/Deliberate-inpainting.safetensors [cb15a7187a]")
      break
    case RENDER_MODEL_TYPE:
      await change_model("2.1/rmadaMergeSD21768_v70.safetensors [b346aa1648]")
      break
  }
  figma.ui.postMessage({ type: 'select_model_type', model_type: model_type });
}
async function change_model(model_name: string) {
  let query: any = {
    "sd_model_checkpoint": model_name,
  }
  let res = await fetch(`${settings.url}/sdapi/v1/options`, {
    method: 'POST',
    headers: settings.getHeaders(),
    body: JSON.stringify(query)
  });
  let data = await res.json();
  return data
}
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
async function txt2img() {
  let prompt = get_styled_prompt(cache.prompt, cache.style);
  let query: any = {
    "prompt": prompt,
    "negative_prompt": default_bad_prompt,
    "steps": cache.step,
    "sampler_index": cache.sampler,
    "seed": cache.seed,
    "cfg_scale": 7,
    "width": cache.width,
    "height": cache.height,
  }
  let res = await fetch(`${settings.url}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: settings.getHeaders(),
    body: JSON.stringify(query)
  });
  let data = await res.json();
  const base64 = data['images'][0];
  const byte_array = await base64_to_Uint8Array(base64);
  create_image_node("txt2image", byte_array);
}
async function auto_mask() {
  const uint8array = await figma.currentPage.selection[0].exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } })
  const imageUrl = await Uint8Array_to_base64(uint8array)
  const base64 = await get_auto_mask(imageUrl, cache.mask_only);
  const byte_array = await base64_to_Uint8Array(base64);
  create_image_node("auto_mask", byte_array);
}
async function prompt_mask() {
  const uint8array = await figma.currentPage.selection[0].exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
  const imageUrl = await Uint8Array_to_base64(uint8array);
  let prompt = get_styled_prompt(cache.prompt, cache.style);
  let query: any = {
    "image_str": imageUrl,
    "prompts": prompt,
    "neg_prompts": "white background",
    "only_mask": cache.mask_only,
    "threshold": 0.4,
    "mask_blur_median": 11,
    "mask_blur_gaussian": 11,
  }
  let res = await fetch(`${settings.url}/prompt_mask/remove-background`, {
    method: 'POST',
    headers: settings.getHeaders(),
    body: JSON.stringify(query)
  });
  let data = await res.json();
  const base64 = data['mask'];
  const byte_array = await base64_to_Uint8Array(base64);
  create_image_node("prompt_mask", byte_array);
}
async function change_background() {
  let prompt = get_styled_prompt(cache.prompt, cache.style);
  const selectedNode = figma.currentPage.selection[0];
  const uint8array = await extract_uint8array_from_image_node(selectedNode);
  const imageUrl = await Uint8Array_to_base64(uint8array);
  let maskUrl;
  if (figma.currentPage.selection.length < 2) {
    maskUrl = await get_auto_mask(imageUrl, true);
  } else {
    const selectedMask = figma.currentPage.selection[1];
    const uint8array = await extract_uint8array_from_image_node(selectedMask);
    maskUrl = await Uint8Array_to_base64(uint8array);
  }
  let query: any = {
    "init_images": [imageUrl],
    "resize_mode": 0,
    "mask_blur": 1,
    "denoising_strength": 1,
    "mask": maskUrl,
    "inpainting_fill": 3,
    "inpainting_mask_invert": 1,
    "prompt": prompt,
    "negative_prompt": default_bad_prompt,
    "steps": cache.step,
    "sampler_index": cache.sampler,
    "cfg_scale": 7,
    "width": cache.width,
    "height": cache.height,
    "seed": cache.seed,
  }
  let res = await fetch(`${settings.url}/sdapi/v1/img2img`, {
    method: 'POST',
    headers: settings.getHeaders(),
    body: JSON.stringify(query)
  });
  let data = await res.json();
  const base64 = data['images'][0];
  const byte_array = await base64_to_Uint8Array(base64);
  create_image_node("change_background", byte_array, selectedNode.width, selectedNode.height);
}
async function image_2_vectors() {
  let width = figma.currentPage.selection[0].width;
  let height = figma.currentPage.selection[0].height;
  const uint8array = await figma.currentPage.selection[0].exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
  const imageUrl = await Uint8Array_to_base64(uint8array);
  const canny = await get_canny(imageUrl, cache.canny_low_threshold, cache.canny_high_threshold);
  const svgstr = await image_to_svg(canny);
  create_node_from_svg("image_2_vectors", svgstr, width, height);
}
async function vectors_2_image() {
  const selectedNode = figma.currentPage.selection[0];
  const uint8array = await extract_uint8array_from_image_node(selectedNode);
  const imageUrl = await Uint8Array_to_base64(uint8array);
  const prompt = get_styled_prompt(cache.prompt, cache.style);
  const query: any = {
    "prompt": prompt,
    "negative_prompt": default_bad_prompt,
    "steps": cache.step,
    "sampler_index": cache.sampler,
    "cfg_scale": 7,
    "width": cache.width,
    "height": cache.height,
    "seed": cache.seed,
    "alwayson_scripts": {
      "controlnet": {
        "args": [
          {
            "input_image": `data:image/png;base64,${imageUrl}`,
            "module": "scribble",
            "model": cache.control_net_for_sketch,
            "guessmode": false,
            "weight": Number(cache.vectors_guidance),
          }
        ]
      }
    }
  }
  const res = await fetch(`${settings.url}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: settings.getHeaders(),
    body: JSON.stringify(query)
  });
  const data = await res.json();
  const base64 = data['images'][0];
  const byte_array = await base64_to_Uint8Array(base64);
  create_image_node("vectors_2_image", byte_array, selectedNode.width, selectedNode.height);
}

async function beautify_mask_edge() {
  let prompt = get_styled_prompt(cache.prompt, cache.style);
  const selectedNode = figma.currentPage.selection[0];
  const uint8array = await extract_uint8array_from_image_node(selectedNode);
  const imageUrl = await Uint8Array_to_base64(uint8array);
  const query: any = {
    "init_images": [imageUrl],
    "resize_mode": 0,
    "denoising_strength": 0.1,
    "prompt": prompt,
    "negative_prompt": default_bad_prompt,
    "steps": cache.step,
    "sampler_index": cache.sampler,
    "cfg_scale": 7,
    "width": cache.width,
    "height": cache.height,
    "seed": cache.seed,
  }
  let res = await fetch(`${settings.url}/sdapi/v1/img2img`, {
    method: 'POST',
    headers: settings.getHeaders(),
    body: JSON.stringify(query)
  });
  const data = await res.json();
  const base64 = data['mask'];
  const byte_array = await base64_to_Uint8Array(base64);
  create_image_node("beautify_mask_edge", byte_array, selectedNode.width, selectedNode.height);
}
async function get_auto_mask(imageUrl: string, mask_only: boolean) {
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
  let res = await fetch(`${settings.url}/auto_mask/remove-background`, {
    method: 'POST',
    headers: settings.getHeaders(),
    body: JSON.stringify(query)
  });
  let data = await res.json();
  const base64 = data['mask'];
  return base64;
}
async function get_canny(imageUrl: string, canny_low_threshold: number, canny_high_threshold: number) {
  let query = {
    image_str: imageUrl,
    annotator_resolution: 512,
    canny_low_threshold: canny_low_threshold,
    canny_high_threshold: canny_high_threshold,
  }
  let res = await fetch(`${settings.url}/figma/canny`, {
    method: 'POST',
    headers: settings.getHeaders(),
    body: JSON.stringify(query)
  });
  let data = await res.json();
  const base64 = data['image'] as string;
  return base64;
}
function get_styled_prompt(prompt: string, style: string) {
  const BASE_PROMPT = ",(((lineart))),((low detail)),(simple),high contrast,sharp,2 bit"
  switch (style) {
    case "photo":
      prompt = `.photo realistic, ultra details, natural light,
      ${prompt}
      ,  octane, dimly lit, low key,
      , digital art, (photo, 80 mm, hyperrealistic, big depth of field, colors, hyperdetailed, hyperrealistic) , ((moody lighting)), (ambient light)
      `;
      break;
    case "icon":
      prompt = `${prompt}
        ${BASE_PROMPT},(((centered vector graphic logo))),negative space,stencil,trending on dribbble`
      break;
    case "sticker":
      prompt = `${prompt}
      ,(Die-cut sticker, kawaii sticker,contrasting background, illustration minimalism, vector, pastel colors)
      `;
      break;
    case "anime":
      prompt = `${prompt}
      ${BASE_PROMPT},(((clean ink anime illustration))),Studio Ghibli,Makoto Shinkai,Hayao Miyazaki,Audrey Kawasaki
      `;
      break;
    case "studio":
      prompt = `.photo realistic, ultra details, natural light,
      ${prompt}
      ,(rim lighting,:1.4) two tone lighting,  octane, unreal, dimly lit, low key,
      , digital art, (photo, studio lighting, hard light, high contrast lighting
      sony a7, 50 mm, hyperrealistic, big depth of field, concept art, colors, hyperdetailed, hyperrealistic) , ((moody lighting)), (fog), (ambient light)
      `;
      break;
    case "illustration":
      prompt = `${prompt}
        ${BASE_PROMPT},(((vector graphic))),medium detail
        `;
      break;
    case "logo":
      prompt = `${prompt}
          ${BASE_PROMPT},(((centered vector graphic logo))),negative space,stencil,trending on dribbble
          `;
      break;
    case "artistic":
      prompt = `${prompt}
            ${BASE_PROMPT},(((artistic monochrome painting))),precise lineart,negative space
            `;
      break;
    case "tattoo":
      prompt = `${prompt}
              ${BASE_PROMPT},(((tattoo template, ink on paper))),uniform lighting,lineart,negative space
              `;
      break;
    case "gothic":
      prompt = `${prompt}
                ${BASE_PROMPT},(((gothic ink on paper))),H.P. Lovecraft,Arthur Rackham
                `;
      break;
    case "cartoon":
      prompt = `${prompt}
                  ${BASE_PROMPT},(((clean ink funny comic cartoon illustration)))
                  `;
    default:
      break;
  }
  if (/scifi/.test(prompt)) prompt = `fking_scifi_v2,${prompt}`

  return prompt;
}
async function create_image_node(original_task: string, byte_array: Uint8Array, width = -1, height = -1) {
  const imageNode = figma.createRectangle();
  const image = await figma.createImage(byte_array);
  if (width === -1 || height === -1) { let size = await image.getSizeAsync(); width = size.width; height = size.height; }
  imageNode.resize(width, height);
  imageNode.fills = [
    {
      type: 'IMAGE',
      imageHash: image.hash,
      scaleMode: 'FILL'
    }
  ]
  imageNode.name = cache.seed;
  imageNode.x = figma.viewport.center.x - width / 2;
  imageNode.y = figma.viewport.center.y - height / 2;
  figma.ui.postMessage({ original_task, type: 'done' });
}
async function create_node_from_svg(original_task: string, svgstr: string, width: number, height: number) {
  const node = figma.createNodeFromSvg(svgstr);
  node.x = figma.viewport.center.x - width / 2;
  node.y = figma.viewport.center.y - height / 2;
  node.resize(width, height);
  figma.currentPage.appendChild(node);
  figma.ui.postMessage({ original_task, type: 'done' });
}
function keep_aspect_ratio(width: number, height: number) {
  let ratio = 1;
  if (width > height) {
    ratio = IDEAL_SIZE / height;
    height = IDEAL_SIZE;
    width = width * ratio;
    const newHeight = width * (height / width);
    width = width;
    height = newHeight;
  } else {
    ratio = IDEAL_SIZE / width;
    width = IDEAL_SIZE;
    height = height * ratio;
    const newWidth = height * (width / height);
    height = height;
    width = newWidth;
  }
  return { width, height }
}
async function get_loaded_model() {
  if (settings.url === "") return
  let res = await fetch(`${settings.url}/sdapi/v1/options`, { method: 'GET', headers: settings.getHeaders() });
  if (res.status === 403 || res.status === 401) figma.ui.postMessage({ type: 'server_too_busy', used_base_model: cache.used_base_model });
  let options = await res.json();
  return options['sd_model_checkpoint'];
}
function get_model_type(model_name: string) {
  if (/inpaint/.test(model_name)) return INPAINT_MODEL_TYPE
  return RENDER_MODEL_TYPE
}
async function control_net_for_sketch_picker() {
  if (settings.url === "") return
  let res = await fetch(`${settings.url}/controlnet/model_list`, { method: 'GET', headers: settings.getHeaders() });
  let model_list = await res.json();
  model_list = model_list['model_list'];
  for (let model_name of model_list) {
    let controlNetAvailable = false
    if (/1\.5\//.test(cache.used_base_model)) {
      controlNetAvailable = /sd15/.test(model_name) && /scribble/.test(model_name);
    } else if (/2\.1\//.test(cache.used_base_model)) {
      controlNetAvailable = /sd21/.test(model_name) && /scribble/.test(model_name);
    }
    if (controlNetAvailable) {
      cache.control_net_for_sketch = model_name;
      return
    }
  }
}

async function extract_uint8array_from_image_node(node: SceneNode) {
  const width = node.width;
  const height = node.height;
  let uint8array = null;
  if (
    node.type === "RECTANGLE" ||
    node.type === "ELLIPSE" ||
    node.type === "POLYGON" ||
    node.type === "STAR" ||
    node.type === "VECTOR"
  ) {
    node.resize(cache.width, cache.height);
    uint8array = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
    node.resize(width, height);
  } else {
    uint8array = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
  }
  return uint8array;
}




async function get_selected_image() {
  if (figma.currentPage.selection.length === 0) return null
  return await figma.currentPage.selection[0].exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } })
}
async function get_selected_image_n_mask() {
  if (figma.currentPage.selection.length < 2 && figma.currentPage.selection.length > 0) {
    let image = await get_selected_image();
    return { image, mask: null }
  }
  let image = await figma.currentPage.selection[0].exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } })
  let mask = await figma.currentPage.selection[1].exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } })
  return { image, mask }
}