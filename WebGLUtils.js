import { mat4, vec3 } from 'https://cdn.jsdelivr.net/npm/gl-matrix@3.4.0/+esm';

const WebGLUtils = {
	initWebGL() {
		const canvas = document.getElementById('glcanvas');
		const gl = canvas.getContext('webgl2');
		if (!gl) {
			alert('WebGL 2.0 not supported!');
			return null;
		}

		return gl;
	},

	resizeCanvasToWindow(gl) {
		gl.canvas.width = window.innerWidth;
		gl.canvas.height = window.innerHeight;
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	},

	async loadShaderSrc(path) {
		const response = await fetch(path);
		if (!response.ok) {
			console.error(`Failed to load shader source from ${path}:`, response.statusText);
			return null;
		}

		return response.text();
	},

	_compileShader(gl, shaderSrc, type) {
		const shader = gl.createShader(type);
		gl.shaderSource(shader, shaderSrc);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.error(`Shader compile failed (${shaderSrc}):\n`, gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return null;
		}

		return shader;
	},

	compileProgram(gl, vertexShaderSrc, fragmentShaderSrc) {
		const vertexShader = this._compileShader(gl, vertexShaderSrc, gl.VERTEX_SHADER);
		const fragmentShader = this._compileShader(gl, fragmentShaderSrc, gl.FRAGMENT_SHADER);

		const program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.error('Program link failed:', gl.getProgramInfoLog(program));
			gl.deleteProgram(program);
			return null;
		}

		return program;
	},

	async createProgram(gl, vertexShaderPath, fragmentShaderPath) {
		const vertexShaderSrc = await this.loadShaderSrc(vertexShaderPath);
		const fragmentShaderSrc = await this.loadShaderSrc(fragmentShaderPath);
		const program = this.compileProgram(gl, vertexShaderSrc, fragmentShaderSrc);

		return program;
	},

	setUniformMatrix4fv(gl, program, uniformNames, matricies) {
		gl.useProgram(program);

		for (let i = 0; i < uniformNames.length; i++) {
			gl.uniformMatrix4fv(
				gl.getUniformLocation(program, uniformNames[i]),
				false,
				matricies[i]
			);
		}

		gl.useProgram(null);
	},

	setUniform3f(gl, program, uniformNames, values) {
		gl.useProgram(program);
		for (let i = 0; i < uniformNames.length; i++) {
			gl.uniform3f(
				gl.getUniformLocation(program, uniformNames[i]),
				values[i][0],
				values[i][1],
				values[i][2]
			);
		}
		gl.useProgram(null);
	},

	_parseOBJFile(objText) {
		const positions = [];
		const texCoords = [];
		const normals = [];
		const faces = [];

		const lines = objText.split('\n');
		for (const line of lines) {
			const parts = line.trim().split(/\s+/);
			if (parts[0] === 'v') {
				positions.push(parts.slice(1).map(Number));
			} else if (parts[0] === 'vt') {
				texCoords.push(parts.slice(1).map(Number));
			} else if (parts[0] === 'vn') {
				normals.push(parts.slice(1).map(Number));
			} else if (parts[0] === 'f') {
				const faceIndices = parts.slice(1).map(part => parseInt(part.split('/')[0]) - 1);
				const faceTexCoords = parts.slice(1).map(part => parseInt(part.split('/')[1]) - 1);
				const faceNormals = parts.slice(1).map(part => parseInt(part.split('/')[2]) - 1);
				faces.push([faceIndices, faceTexCoords, faceNormals]);
			}
		}

		return {
			positions: positions,
			texCoords: texCoords,
			normals: normals,
			faces: faces
		};
	},

	_parseOBJData(objData, useAveragedNormals = false) {
		const vertices = [];
		const averagedNormals = this._calculateAveragedNormals(objData);

		for (const face of objData.faces) {
			const [indices, texIndices, normalIndices] = face;
			for (let i = 0; i < indices.length; i++) {
				vertices.push(objData.positions[indices[i]]);
				vertices.push(objData.texCoords[texIndices[i]]);

				if (useAveragedNormals) {
					vertices.push(averagedNormals[indices[i]]);
				} else {
					vertices.push(objData.normals[normalIndices[i]]);
				}
			}
		}

		return vertices;
	},

	_calculateAveragedNormals(objData) {
		const averageNormals = [];
		const normalMap = new Map();

		objData.positions.forEach((_, index) => {
			normalMap.set(index, new Set());
		});

		objData.faces.forEach(face => {
			const [indices, _, normalIndices] = face;
			for (let i = 0; i < indices.length; i++) {
				normalMap.get(indices[i]).add(normalIndices[i]);
			}
		});

		for (const [_, normalIndicesSet] of normalMap.entries()) {
			const normals = Array.from(normalIndicesSet).map(i => objData.normals[i]);

			const averageNormal = normals.reduce((acc, normal) => {
				acc[0] += normal[0];
				acc[1] += normal[1];
				acc[2] += normal[2];
				return acc;
			}, [0, 0, 0]);

			averageNormal[0] /= normals.length;
			averageNormal[1] /= normals.length;
			averageNormal[2] /= normals.length;

			averageNormals.push(averageNormal);
		}

		return averageNormals;
	},

	async loadOBJ(path, useAveragedNormals = false) {
		const response = await fetch(path);
		if (!response.ok) {
			console.error(`Failed to load OBJ file from ${path}:`, response.statusText);
			return null;
		}

		const objText = await response.text();
		const objData = this._parseOBJFile(objText);
		const vertices = this._parseOBJData(objData, useAveragedNormals);

		return new Float32Array(vertices.flat());
	},

	createModelViewProjection(gl, cameraPos, target = [0, 0, 0]) {
		const modelMat = mat4.create();
		const viewMat = mat4.create();
		const projectionMat = mat4.create();

		const cameraVec = vec3.fromValues(cameraPos[0], cameraPos[1], cameraPos[2]);
		const targetVec = vec3.fromValues(target[0], target[1], target[2]);

		mat4.lookAt(
			viewMat,
			cameraVec,	// eye		(camera position)
			targetVec,	// center (look at)
			[0, 1, 0]		// up vector
		);

		mat4.perspective(
			projectionMat,
			45 * Math.PI / 180, 								// Field of view (in radians)
			gl.canvas.width / gl.canvas.height, // aspect ratio
			0.1, 																// near plane
			100 																// far plane
		);

		return { modelMat, viewMat, projectionMat };
	},

	createVAO(gl, program, vertices, numAttributes, attributesLayout) {
		const VAO = gl.createVertexArray();
		gl.bindVertexArray(VAO);

		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

		for (let i = 0; i < attributesLayout.length; i++) {
			const { name, size, offset } = attributesLayout[i];
			const loc = gl.getAttribLocation(program, name);
			if (loc === -1) {
				console.warn(`Attribute ${name} not found in program.`);
				continue;
			}

			gl.vertexAttribPointer(loc, size, gl.FLOAT, false, numAttributes * Float32Array.BYTES_PER_ELEMENT, offset * Float32Array.BYTES_PER_ELEMENT);
			gl.enableVertexAttribArray(loc);
		}

		gl.bindVertexArray(null);

		return VAO;
	},

	async loadTexture(gl, path) {
		const image = new Image();
		image.src = path;

		return new Promise((resolve, reject) => {
			image.onload = () => {
				const texture = gl.createTexture();
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
				gl.generateMipmap(gl.TEXTURE_2D);
				gl.bindTexture(gl.TEXTURE_2D, null);
				resolve(texture);
			};
			image.onerror = (err) => {
				reject(`Failed to load texture from ${path}: ${err}`);
			};
		});
	}
}

export default WebGLUtils;