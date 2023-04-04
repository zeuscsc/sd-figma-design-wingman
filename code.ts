figma.showUI(__html__, { width: 300, height: 720 });
figma.ui.onmessage = async msg => {
  if (msg.type === 'txt2img') {
    let width = msg.width;
    let height = msg.height;
    txt2img(msg.prompt, width, height);
  }
  if (msg.type === 'preview') {
    preview(msg.byte_array);
  }
  if (msg.type === 'get_selected_image') {
    await get_selected_image();
  }
  if (msg.type === 'create_node_from_svg') {
    console.log(msg.svgstr)
    const svgString = msg.svgstr;
    const width = msg.width;
    const height = msg.height;
    const node = figma.createNodeFromSvg(svgString);
    node.resize(width, height);
    figma.currentPage.appendChild(node);
    figma.currentPage.selection = [node];
  }
  if (msg.type === 'cancel')
    figma.closePlugin();
};

function api_results(base64: string) {
  figma.ui.postMessage({ type: 'api_results', data: base64 });
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
async function txt2img(prompt: string, width: number = 512, height: number = 512) {
  let query: any = {
    "prompt": prompt,
    "negative_prompt": "pencil draw, bad photo, bad draw, saturated photo, unreal engine, ugly, desfigured,text,string,article",
    "steps": 30,
    "sampler_index": "Euler a",
    "cfg_scale": 7,
    "width": width,
    "height": height,
  }
  console.log(JSON.stringify(query))
  let res = await fetch('https://sd.zeuschiu.com/sdapi/v1/txt2img', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(query)
  });
  let data = await res.json();
  api_results(data['images'][0])
}

async function preview(byte_array: Uint8Array) {
  const nodes: SceneNode[] = [];
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
  nodes.push(imageNode);
  figma.currentPage.selection = nodes;
  figma.viewport.scrollAndZoomIntoView(nodes);
  figma.ui.postMessage({ type: 'done' });
}
async function get_selected_image() {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return
  const imageData=await selection[0].exportAsync({format: "PNG", constraint: {type: "SCALE", value: 1}})
  figma.ui.postMessage({ type: 'selected_image', data: imageData });
}