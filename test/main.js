import WebGLUtils from '../WebGLUtils.js';
import { mat4 } from 'https://cdn.jsdelivr.net/npm/gl-matrix@3.4.0/+esm';

async function main() {
	const gl = WebGLUtils.initWebGL();
	WebGLUtils.resizeCanvasToWindow(gl);

	const program = await WebGLUtils.createProgram(gl, 'vertex-shader.glsl', 'fragment-shader.glsl');
	if (!program) return;

	const objVertices = await WebGLUtils.loadOBJ('../shapes/grass.obj',false);
	const attributesLayout = [
		{ name: 'in_position', size: 3, offset: 0 },
		{ name: 'in_uv', size: 2, offset: 3 },
		{ name: 'in_normal', size: 3, offset: 5 }
	];

	const VAO = WebGLUtils.createVAO(gl, program, objVertices, 8, attributesLayout);

	const texture = await WebGLUtils.loadTexture(gl, '../textures/grass.webp');

	const { viewMat, projectionMat } = WebGLUtils.createModelViewProjection(gl, [0, 20, 30]);

	const modelMatrices = [];
	for (let i = -5; i <= 5; i++) {
		for (let j = -5; j <= 5; j++) {
			const modelMat = mat4.create();
			mat4.translate(modelMat, modelMat, [i * 2.01, 0, j * 2.01]);
			modelMatrices.push(modelMat);
		}
	}

	gl.enable(gl.DEPTH_TEST);

	function render() {
		gl.clearColor(0.2, 0.2, 0.2, 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.useProgram(program);
		gl.bindVertexArray(VAO);

		gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_view'), false, viewMat);
		gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_projection'), false, projectionMat);

		gl.uniform3fv(gl.getUniformLocation(program, 'u_light_direction'), [0.5, 1.0, 0.3]);
		gl.uniform3fv(gl.getUniformLocation(program, 'u_ambient_color'), [0.2, 0.2, 0.2]);
		gl.uniform3fv(gl.getUniformLocation(program, 'u_light_color'), [1.0, 1.0, 1.0]);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

		const modelLoc = gl.getUniformLocation(program, 'u_model');
		for (const modelMat of modelMatrices) {
			gl.uniformMatrix4fv(modelLoc, false, modelMat);
			gl.drawArrays(gl.TRIANGLES, 0, objVertices.length / 8);
		}

		gl.bindVertexArray(null);
		gl.useProgram(null);
		requestAnimationFrame(render);
	}

	render();
}

main();

