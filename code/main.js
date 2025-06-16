import { mat4, vec3 } from 'https://cdn.jsdelivr.net/npm/gl-matrix@3.4.0/+esm';
import WebGLUtils from '../WebGLUtils.js';

async function main() {
  const gl = WebGLUtils.initWebGL();

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);


  WebGLUtils.resizeCanvasToWindow(gl);


  const vertices = await WebGLUtils.loadOBJ("../shapes/grass.obj", false);
  const texture = await WebGLUtils.loadTexture(gl, "../textures/brick.webp");


  const program = await WebGLUtils.createProgram(gl, "vertex-shader.glsl", "fragment-shader.glsl");

  gl.useProgram(program);
  const textureLoc = gl.getUniformLocation(program, "u_texture");
  gl.uniform1i(textureLoc, 0);

  // Setup lights
  const lightDir = vec3.fromValues(2.0, 2.0, 2.0);
  const lightColor = vec3.fromValues(0.95, 0.95, 0.95);    // white light
  const ambientColor = vec3.fromValues(0.1, 0.1, 0.1);  // dimmed ambient light

  let cameraPos = vec3.fromValues(2, 2, 5);
  let yaw = -Math.PI / 2;
  let pitch = 0;
  const sensitivity = 0.002;
  const movementSpeed = 0.1;
  const up = vec3.fromValues(0, 1, 0);


  WebGLUtils.setUniform3f(gl, program,
    ["u_view_direction", "u_ambient_color", "u_light_direction", "u_light_color"],
    [cameraPos, ambientColor, lightDir, lightColor]
  );

  const VAO = WebGLUtils.createVAO(gl, program, vertices, 8, [
    { name: "in_position", size: 3, offset: 0 },
    { name: "in_uv", size: 2, offset: 3 },
    { name: "in_normal", size: 3, offset: 5 },
  ]);
  

  let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;

  // Toggle pointer lock with 'L' key
  document.addEventListener('keydown', (event) => {
    if (event.key === 'l' || event.key === 'L') {
      if (document.pointerLockElement === gl.canvas) {
        document.exitPointerLock();
      } else {
        gl.canvas.requestPointerLock();
      }
    }
    switch (event.key) {
      case 'w': moveForward = true; break;
      case 's': moveBackward = true; break;
      case 'a': moveLeft = true; break;
      case 'd': moveRight = true; break;
    }
  });

  document.addEventListener('keyup', (event) => {
    switch (event.key) {
      case 'w': moveForward = false; break;
      case 's': moveBackward = false; break;
      case 'a': moveLeft = false; break;
      case 'd': moveRight = false; break;
    }
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === gl.canvas) {
      console.log('Pointer locked');
    } else {
      console.log('Pointer unlocked');
    }
  });

  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === gl.canvas) {
      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;

      yaw += movementX * sensitivity;
      pitch -= movementY * sensitivity;

      pitch = Math.max(Math.min(pitch, Math.PI / 2), -Math.PI / 2);
    }
  });

  

  function updateCameraPosition() {
    const front = vec3.fromValues(
      Math.cos(pitch) * Math.cos(yaw),
      Math.sin(pitch),
      Math.cos(pitch) * Math.sin(yaw)
    );
    vec3.normalize(front, front);

    const right = vec3.create();
    vec3.cross(right, front, up);
    vec3.normalize(right, right);

    const forward = vec3.create();
    vec3.scaleAndAdd(forward, cameraPos, front, movementSpeed);

    const backward = vec3.create();
    vec3.scaleAndAdd(backward, cameraPos, front, -movementSpeed);

    const left = vec3.create();
    vec3.scaleAndAdd(left, cameraPos, right, -movementSpeed);

    const rightMove = vec3.create();
    vec3.scaleAndAdd(rightMove, cameraPos, right, movementSpeed);

    if (moveForward) vec3.copy(cameraPos, forward);
    if (moveBackward) vec3.copy(cameraPos, backward);
    if (moveLeft) vec3.copy(cameraPos, left);
    if (moveRight) vec3.copy(cameraPos, rightMove);
  }

  function render() {
    gl.clearColor(1, 1, 1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    updateCameraPosition();

    const front = vec3.fromValues(
      Math.cos(pitch) * Math.cos(yaw),
      Math.sin(pitch),
      Math.cos(pitch) * Math.sin(yaw)
    );
    vec3.normalize(front, front);

    const viewMat = mat4.create();
    mat4.lookAt(viewMat, cameraPos, vec3.add(vec3.create(), cameraPos, front), up);

    const projectionMat = mat4.create();
    mat4.perspective(projectionMat, Math.PI / 4, gl.canvas.width / gl.canvas.height, 0.1, 100.0);

    WebGLUtils.setUniformMatrix4fv(gl, program,
      ["u_model", "u_view", "u_projection"],
      [mat4.create(), viewMat, projectionMat]
    );

    gl.useProgram(program);
    gl.bindVertexArray(VAO);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 8);

    requestAnimationFrame(render);
  }

  render();
}

main();
