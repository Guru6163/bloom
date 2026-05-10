figma.showUI(__html__, { width: 420, height: 760, title: 'Bloom' });

type IncomingMessage =
  | { type: 'LOAD_KEY' }
  | { type: 'SAVE_KEY'; key: string }
  | { type: 'LOAD_BRAND' }
  | { type: 'SAVE_BRAND'; brandId: string }
  | { type: 'GET_SELECTION' }
  | { type: 'GET_SELECTED_IMAGE_URL' }
  | {
      type: 'INSERT_IMAGE';
      imageUrl: string;
      frameWidth?: number;
      frameHeight?: number;
      prompt?: string;
      aspectRatio?: string;
    }
  | {
      type: 'REPLACE_IMAGE';
      imageUrl: string;
      nodeId: string;
      prompt?: string;
      aspectRatio?: string;
    }
  | {
      type: 'BATCH_INSERT';
      items: Array<{
        nodeId: string;
        imageUrl: string;
        prompt?: string;
        aspectRatio?: string;
      }>;
    }
  | { type: 'FETCH_IMAGE_DATA'; imageId: string; imageUrl: string }
  | { type: 'CLOSE' };

function sendSelectionInfo(): void {
  const selection = figma.currentPage.selection;

  if (selection.length > 1 && selection.every((node) => node.type === 'FRAME')) {
    const frames = selection as FrameNode[];
    figma.ui.postMessage({
      type: 'MULTI_FRAME_SELECTED',
      count: frames.length,
      frames: frames.map((frame) => ({
        id: frame.id,
        name: frame.name,
        width: Math.round(frame.width),
        height: Math.round(frame.height),
      })),
    });
    return;
  }

  if (selection.length === 1 && (selection[0].type === 'RECTANGLE' || selection[0].type === 'FRAME')) {
    const node = selection[0] as RectangleNode | FrameNode;
    const hasImageFill =
      Array.isArray(node.fills) && (node.fills as Paint[]).some((fill: Paint) => fill.type === 'IMAGE');
    if (hasImageFill) {
      figma.ui.postMessage({
        type: 'IMAGE_LAYER_SELECTED',
        width: Math.round(node.width),
        height: Math.round(node.height),
        name: node.name,
        nodeId: node.id,
      });
      return;
    }
  }

  if (selection.length === 1 && selection[0].type === 'FRAME') {
    const frame = selection[0] as FrameNode;
    figma.ui.postMessage({
      type: 'FRAME_SELECTED',
      width: Math.round(frame.width),
      height: Math.round(frame.height),
      name: frame.name,
      nodeId: frame.id,
    });
    return;
  }
  figma.ui.postMessage({ type: 'NO_FRAME_SELECTED' });
}

sendSelectionInfo();
figma.on('selectionchange', sendSelectionInfo);

figma.ui.onmessage = async (msg: IncomingMessage) => {
  try {
    switch (msg.type) {
      case 'LOAD_KEY': {
        const key = await figma.clientStorage.getAsync('bloom_api_key');
        figma.ui.postMessage({ type: 'KEY_LOADED', key: key || null });
        break;
      }
      case 'SAVE_KEY': {
        await figma.clientStorage.setAsync('bloom_api_key', msg.key);
        figma.ui.postMessage({ type: 'KEY_SAVED' });
        break;
      }
      case 'LOAD_BRAND': {
        const brandId = await figma.clientStorage.getAsync('bloom_brand_id');
        figma.ui.postMessage({ type: 'BRAND_LOADED', brandId: brandId || null });
        break;
      }
      case 'SAVE_BRAND': {
        await figma.clientStorage.setAsync('bloom_brand_id', msg.brandId);
        break;
      }
      case 'GET_SELECTION': {
        sendSelectionInfo();
        break;
      }
      case 'INSERT_IMAGE': {
        try {
          const { imageUrl, frameWidth, frameHeight, prompt, aspectRatio } = msg;
          const response = await fetch(imageUrl);
          if (!response.ok) {
            throw new Error(`Failed to download image (${response.status})`);
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          const image = figma.createImage(bytes);
          const rect = figma.createRectangle();

          rect.resize(Math.round(frameWidth || 1200), Math.round(frameHeight || 628));
          const timestamp = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          });
          const promptSnippet = (prompt || '').slice(0, 40).trim();
          const ratio = aspectRatio || '';
          rect.name = promptSnippet
            ? `Bloom: ${promptSnippet} · ${ratio} · ${timestamp}`
            : `Bloom Generated Image · ${timestamp}`;
          rect.fills = [
            {
              type: 'IMAGE',
              imageHash: image.hash,
              scaleMode: 'FILL',
            },
          ];

          const selection = figma.currentPage.selection;
          if (selection.length === 1 && selection[0].type === 'FRAME') {
            const frame = selection[0];
            rect.x = 0;
            rect.y = 0;
            frame.appendChild(rect);
          } else {
            figma.currentPage.appendChild(rect);
            rect.x = figma.viewport.center.x - rect.width / 2;
            rect.y = figma.viewport.center.y - rect.height / 2;
          }

          figma.currentPage.selection = [rect];
          figma.viewport.scrollAndZoomIntoView([rect]);
          figma.notify('✓ Image inserted', { timeout: 2000 });
          figma.ui.postMessage({ type: 'INSERT_SUCCESS' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to insert image';
          figma.ui.postMessage({ type: 'INSERT_ERROR', message });
        }
        break;
      }
      case 'REPLACE_IMAGE': {
        try {
          const { imageUrl, nodeId, prompt, aspectRatio } = msg;
          const node = figma.getNodeById(nodeId) as RectangleNode | FrameNode | null;
          if (!node) throw new Error('Layer not found');

          const response = await fetch(imageUrl);
          if (!response.ok) throw new Error(`Failed to download image (${response.status})`);
          const arrayBuffer = await response.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const image = figma.createImage(bytes);

          const timestamp = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          });
          const promptSnippet = (prompt || '').slice(0, 40).trim();
          const ratio = aspectRatio || '';

          node.fills = [
            {
              type: 'IMAGE',
              imageHash: image.hash,
              scaleMode: 'FILL',
            },
          ];

          node.name = promptSnippet
            ? `Bloom: ${promptSnippet} · ${ratio} · ${timestamp}`
            : `Bloom Replaced Image · ${timestamp}`;

          figma.currentPage.selection = [node];
          figma.viewport.scrollAndZoomIntoView([node]);
          figma.notify('✓ Image replaced', { timeout: 2000 });
          figma.ui.postMessage({ type: 'REPLACE_SUCCESS' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Replace failed';
          figma.ui.postMessage({ type: 'REPLACE_ERROR', message });
        }
        break;
      }
      case 'BATCH_INSERT': {
        try {
          const { items } = msg;
          for (const item of items) {
            const node = figma.getNodeById(item.nodeId) as FrameNode | null;
            if (!node || node.type !== 'FRAME') continue;

            const response = await fetch(item.imageUrl);
            if (!response.ok) continue;
            const arrayBuffer = await response.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            const image = figma.createImage(bytes);

            const timestamp = new Date().toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            });
            const rect = figma.createRectangle();
            rect.resize(node.width, node.height);
            rect.x = 0;
            rect.y = 0;
            rect.name = `Bloom: ${(item.prompt || '').slice(0, 30)} · ${timestamp}`;
            rect.fills = [
              {
                type: 'IMAGE',
                imageHash: image.hash,
                scaleMode: 'FILL',
              },
            ];
            node.appendChild(rect);

            figma.ui.postMessage({
              type: 'BATCH_ITEM_DONE',
              nodeId: item.nodeId,
            });
          }

          figma.notify(`✓ ${items.length} frames filled`, { timeout: 2000 });
          figma.ui.postMessage({ type: 'BATCH_COMPLETE' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Batch insert failed';
          figma.ui.postMessage({ type: 'BATCH_ERROR', message });
        }
        break;
      }
      case 'GET_SELECTED_IMAGE_URL': {
        try {
          const selection = figma.currentPage.selection;
          if (!selection.length) throw new Error('No selection');

          const node = selection[0] as RectangleNode | FrameNode;
          if (!Array.isArray(node.fills)) throw new Error('No image fill found');
          const fills = node.fills as Paint[];
          const imageFill = fills.find((fill) => fill.type === 'IMAGE') as ImagePaint | undefined;
          if (!imageFill?.imageHash) throw new Error('No image fill found');

          const imageData = figma.getImageByHash(imageFill.imageHash);
          if (!imageData) throw new Error('Could not read image');
          const bytes = await imageData.getBytesAsync();

          let binary = '';
          bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
          const base64 = btoa(binary);
          const dataUrl = `data:image/png;base64,${base64}`;

          figma.ui.postMessage({
            type: 'SELECTED_IMAGE_URL',
            dataUrl,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to get selected image';
          figma.ui.postMessage({
            type: 'SELECTED_IMAGE_URL_ERROR',
            message,
          });
        }
        break;
      }
      case 'FETCH_IMAGE_DATA': {
        try {
          console.log('[Bloom][code.ts] FETCH_IMAGE_DATA request', msg.imageId, msg.imageUrl);
          const response = await fetch(msg.imageUrl, {
            headers: msg.imageUrl.includes('trybloom.ai') ? {} : {},
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);

          let binary = '';
          bytes.forEach((b) => (binary += String.fromCharCode(b)));
          const base64 = btoa(binary);

          let mime = 'image/jpeg';
          if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = 'image/png';
          else if (bytes[0] === 0x47 && bytes[1] === 0x49) mime = 'image/gif';
          else if (bytes[0] === 0x52 && bytes[1] === 0x49) mime = 'image/webp';

          const dataUrl = `data:${mime};base64,${base64}`;
          console.log('[Bloom][code.ts] FETCH_IMAGE_DATA success', msg.imageId, mime, bytes.length);
          figma.ui.postMessage({
            type: 'IMAGE_DATA_RESULT',
            imageId: msg.imageId,
            dataUrl,
          });
        } catch (e) {
          console.log(
            '[Bloom][code.ts] FETCH_IMAGE_DATA error',
            msg.imageId,
            e instanceof Error ? e.message : e
          );
          figma.ui.postMessage({
            type: 'IMAGE_DATA_ERROR',
            imageId: msg.imageId,
            message: e instanceof Error ? e.message : 'Unknown error',
          });
        }
        break;
      }
      case 'CLOSE': {
        figma.closePlugin();
        break;
      }
      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    figma.ui.postMessage({ type: 'INSERT_ERROR', message });
  }
};
