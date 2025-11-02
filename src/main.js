import ShaderPad, { save } from 'shaderpad';
import handleTouch from './handleTouch';
import fragmentShaderSrc from './fragmentShader.glsl';

const MIN_N_STRIPS = 1;
const MAX_N_STRIPS = 1920;
const MIN_N_SHUFFLES = 1;
const MAX_N_SHUFFLES = 32;
const MAX_EXPORT_DIMENSION = 4096;

async function getWebcamStream(facingMode = 'user') {
	const video = document.createElement('video');
	video.autoplay = video.playsInline = video.muted = true;

	try {
		const constraints = {
			video: {
				facingMode,
				width: 4096,
			},
		};
		const stream = await navigator.mediaDevices.getUserMedia(constraints);
		video.srcObject = stream;
		await new Promise(resolve => (video.onloadedmetadata = resolve));
	} catch (error) {
		console.error('Error accessing webcam:', error);
		throw error;
	}

	return video;
}

async function main() {
	// State.
	let currentFacingMode = 'user'; // Selfie camera.

	let videoInput = await getWebcamStream(currentFacingMode);
	let imageInput = null;

	let nStrips = 32;
	let nShuffles = MIN_N_SHUFFLES;

	const app = document.getElementById('app');
	const shutter = document.querySelector('#shutter button');
	app.classList.add('ready');

	document.body.appendChild(videoInput); // HACK: Desktop Safari won’t update the shader otherwise.

	function removeVideoInput() {
		stopWebcamStream();
		if (videoInput.parentNode) {
			videoInput.parentNode.removeChild(videoInput);
		}
	}

	function handleImageDrop(event) {
		event.preventDefault();
		const files = event.dataTransfer.files;
		if (files.length > 0 && files[0].type.startsWith('image/')) {
			handleImageFile(files[0]);
		}
	}

	function handleImageFile(file) {
		const reader = new FileReader();
		reader.onload = e => {
			const image = new Image();
			image.onload = () => {
				removeVideoInput();
				imageInput = image;
				play = () => displayShader.play();
				play();
				displayShader.updateTextures({ u_inputStream: image });
			};
			image.src = e.target.result;
		};
		reader.readAsDataURL(file);
	}

	document.body.addEventListener('dragover', e => e.preventDefault());
	document.body.addEventListener('drop', handleImageDrop);

	const displayShader = new ShaderPad(fragmentShaderSrc);
	const exportCanvas = document.createElement('canvas');
	exportCanvas.classList.add('export');
	const exportShader = new ShaderPad(fragmentShaderSrc, { canvas: exportCanvas, plugins: [save()] });
	[displayShader, exportShader].forEach(shader => {
		shader.initializeUniform('u_nShuffles', 'int', nShuffles);
		shader.initializeUniform('u_nStrips', 'float', nStrips);
		shader.initializeTexture('u_inputStream', videoInput);
	});

	function exportHighRes() {
		displayShader.pause();
		const scaleFactor = Math.pow(2, nShuffles + 1);
		let exportWidth, exportHeight;

		if (imageInput) {
			exportWidth = imageInput.naturalWidth * scaleFactor;
			exportHeight = imageInput.naturalHeight * scaleFactor;
		} else {
			exportWidth = videoInput.videoWidth * scaleFactor;
			exportHeight = videoInput.videoHeight * scaleFactor;
		}

		if (exportWidth > MAX_EXPORT_DIMENSION || exportHeight > MAX_EXPORT_DIMENSION) {
			const aspectRatio = exportWidth / exportHeight;
			if (exportWidth > exportHeight) {
				exportWidth = MAX_EXPORT_DIMENSION;
				exportHeight = Math.round(MAX_EXPORT_DIMENSION / aspectRatio);
			} else {
				exportHeight = MAX_EXPORT_DIMENSION;
				exportWidth = Math.round(MAX_EXPORT_DIMENSION * aspectRatio);
			}
		}
		exportCanvas.width = exportWidth;
		exportCanvas.height = exportHeight;

		exportShader.updateUniforms({ u_nShuffles: nShuffles, u_nStrips: nStrips });
		exportShader.updateTextures({ u_inputStream: imageInput ?? videoInput });
		document.body.appendChild(exportCanvas);
		setTimeout(async () => {
			exportShader.step(0);
			await exportShader.save('pixelquilt');
			document.body.removeChild(exportCanvas);
			play();
		}, 8);
	}

	function stopWebcamStream() {
		if (videoInput.srcObject) {
			videoInput.srcObject.getTracks().forEach(track => track.stop());
		}
	}

	async function switchCamera() {
		if (imageInput) return;
		stopWebcamStream();

		const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
		try {
			videoInput = await getWebcamStream(newFacingMode);
			displayShader.updateTextures({ u_inputStream: videoInput });
			currentFacingMode = newFacingMode;
			document.body.classList.toggle('flipped', newFacingMode === 'environment');
		} catch (error) {
			console.error('Failed to switch camera:', error);
		}
	}

	document.addEventListener('keydown', e => {
		switch (e.key) {
			case 'ArrowUp':
				nStrips = Math.min(MAX_N_STRIPS, nStrips + 1);
				displayShader.updateUniforms({ u_nStrips: nStrips });
				break;
			case 'ArrowDown':
				nStrips = Math.max(MIN_N_STRIPS, nStrips - 1);
				displayShader.updateUniforms({ u_nStrips: nStrips });
				break;
			case 'ArrowRight':
				nShuffles = Math.min(MAX_N_SHUFFLES, nShuffles + 1);
				displayShader.updateUniforms({ u_nShuffles: nShuffles });
				break;
			case 'ArrowLeft':
				nShuffles = Math.max(MIN_N_SHUFFLES, nShuffles - 1);
				displayShader.updateUniforms({ u_nShuffles: nShuffles });
				break;
			case 's':
				exportHighRes();
				break;
		}
	});

	shutter.addEventListener('click', () => {
		exportHighRes();
	});

	handleTouch(document.body, (direction, diff) => {
		if (diff > 16) lastTapTime = 0;
		if (direction === 'x') {
			nShuffles = Math.max(MIN_N_SHUFFLES, Math.min(MAX_N_SHUFFLES, nShuffles + Math.sign(diff) / 8));
			displayShader.updateUniforms({ u_nShuffles: nShuffles });
		} else {
			nStrips = Math.max(MIN_N_STRIPS, Math.min(MAX_N_STRIPS, nStrips - Math.sign(diff)));
			displayShader.updateUniforms({ u_nStrips: nStrips });
		}
	});

	// Double-tap to switch camera.
	let lastTapTime = 0;
	document.body.addEventListener('touchend', () => {
		const currentTime = Date.now();
		if (currentTime - lastTapTime < 300) {
			switchCamera();
		}
		lastTapTime = currentTime;
	});

	let play = function play() {
		displayShader.play(() => {
			displayShader.updateTextures({ u_inputStream: videoInput });
		});
	};
	play();
}

document.addEventListener('DOMContentLoaded', main);
