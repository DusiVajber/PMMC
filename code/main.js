import { mat4, vec3 } from 'https://cdn.jsdelivr.net/npm/gl-matrix@3.4.0/+esm';
import WebGLUtils from '../WebGLUtils.js';

class SceneObject {
  constructor(gl, objPath, texturePath, program) {
    this.gl = gl;
    this.objPath = objPath;
    this.texturePath = texturePath;
    this.program = program;
    this.modelMatrix = mat4.create();
    this.boundingBox = { min: vec3.create(), max: vec3.create() };
  }

  async init() {
    this.vertices = await WebGLUtils.loadOBJ(this.objPath, false);
    this.texture = await WebGLUtils.loadTexture(this.gl, this.texturePath);
    this.VAO = WebGLUtils.createVAO(this.gl, this.program, this.vertices, 8, [
      { name: 'in_position', size: 3, offset: 0 },
      { name: 'in_uv', size: 2, offset: 3 },
      { name: 'in_normal', size: 3, offset: 5 },
    ]);
    this.calculateAABB();
  }

  calculateAABB() {
    let min = vec3.fromValues(Infinity, Infinity, Infinity);
    let max = vec3.fromValues(-Infinity, -Infinity, -Infinity);

    for (let i = 0; i < this.vertices.length; i += 8) {
      const x = this.vertices[i];
      const y = this.vertices[i + 1];
      const z = this.vertices[i + 2];
      min[0] = Math.min(min[0], x);
      min[1] = Math.min(min[1], y);
      min[2] = Math.min(min[2], z);
      max[0] = Math.max(max[0], x);
      max[1] = Math.max(max[1], y);
      max[2] = Math.max(max[2], z);
    }

    this.boundingBox = { min, max };
  }

  updateBoundingBox() {
    // Transform the bounding box corners by modelMatrix
    const corners = [
      vec3.fromValues(this.boundingBox.min[0], this.boundingBox.min[1], this.boundingBox.min[2]),
      vec3.fromValues(this.boundingBox.max[0], this.boundingBox.min[1], this.boundingBox.min[2]),
      vec3.fromValues(this.boundingBox.min[0], this.boundingBox.max[1], this.boundingBox.min[2]),
      vec3.fromValues(this.boundingBox.max[0], this.boundingBox.max[1], this.boundingBox.min[2]),
      vec3.fromValues(this.boundingBox.min[0], this.boundingBox.min[1], this.boundingBox.max[2]),
      vec3.fromValues(this.boundingBox.max[0], this.boundingBox.min[1], this.boundingBox.max[2]),
      vec3.fromValues(this.boundingBox.min[0], this.boundingBox.max[1], this.boundingBox.max[2]),
      vec3.fromValues(this.boundingBox.max[0], this.boundingBox.max[1], this.boundingBox.max[2]),
    ];

    const transformedCorners = corners.map(corner => {
      const transformed = vec3.create();
      vec3.transformMat4(transformed, corner, this.modelMatrix);
      return transformed;
    });

    let min = vec3.clone(transformedCorners[0]);
    let max = vec3.clone(transformedCorners[0]);

    transformedCorners.forEach(corner => {
      vec3.min(min, min, corner);
      vec3.max(max, max, corner);
    });

    this.transformedBoundingBox = { min, max };
  }

  draw() {
    this.gl.useProgram(this.program);
    this.gl.bindVertexArray(this.VAO);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, this.vertices.length / 8);
  }

  drawBoundingBox() {
    // Draw wireframe box for bounding box
    this.updateBoundingBox();

    const b = this.transformedBoundingBox;
    const corners = [
      vec3.fromValues(b.min[0], b.min[1], b.min[2]),
      vec3.fromValues(b.max[0], b.min[1], b.min[2]),
      vec3.fromValues(b.min[0], b.max[1], b.min[2]),
      vec3.fromValues(b.max[0], b.max[1], b.min[2]),
      vec3.fromValues(b.min[0], b.min[1], b.max[2]),
      vec3.fromValues(b.max[0], b.min[1], b.max[2]),
      vec3.fromValues(b.min[0], b.max[1], b.max[2]),
      vec3.fromValues(b.max[0], b.max[1], b.max[2]),
    ];

    const edges = [
      [0, 1], [1, 3], [3, 2], [2, 0], // bottom
      [4, 5], [5, 7], [7, 6], [6, 4], // top
      [0, 4], [1, 5], [2, 6], [3, 7]  // sides
    ];

    const lineVertices = [];
    edges.forEach(([start, end]) => {
      lineVertices.push(...corners[start], ...corners[end]);
    });

    if (!this.boundingBoxVAO) {
      this.boundingBoxVAO = this.gl.createVertexArray();
      this.gl.bindVertexArray(this.boundingBoxVAO);

      this.boundingBoxVBO = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.boundingBoxVBO);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(lineVertices), this.gl.DYNAMIC_DRAW);

      const posLoc = this.gl.getAttribLocation(this.program, 'in_position');
      this.gl.enableVertexAttribArray(posLoc);
      this.gl.vertexAttribPointer(posLoc, 3, this.gl.FLOAT, false, 0, 0);
    } else {
      this.gl.bindVertexArray(this.boundingBoxVAO);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.boundingBoxVBO);
      this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, new Float32Array(lineVertices));
    }

    this.gl.useProgram(this.program);
    this.gl.bindVertexArray(this.boundingBoxVAO);
    this.gl.drawArrays(this.gl.LINES, 0, lineVertices.length / 3);
  }
}

const faceNames = {
  0: 'Left (-X)',
  1: 'Right (+X)',
  2: 'Bottom (-Y)',
  3: 'Top (+Y)',
  4: 'Back (-Z)',
  5: 'Front (+Z)'
};

function rayIntersectAABBWithFace(origin, direction, aabb, maxDistance = 8) {
  let tNear = -Infinity;
  let tFar = Infinity;
  let faceIndex = -1;

  for (let i = 0; i < 3; i++) {
    if (Math.abs(direction[i]) < 1e-8) {
      if (origin[i] < aabb.min[i] || origin[i] > aabb.max[i]) return null;
    } else {
      let ood = 1 / direction[i];
      let t1 = (aabb.min[i] - origin[i]) * ood;
      let t2 = (aabb.max[i] - origin[i]) * ood;

      let faceNear, faceFar;
      if (t1 < t2) {
        faceNear = i * 2 + 0; // min face for axis i
        faceFar = i * 2 + 1;  // max face for axis i
      } else {
        [t1, t2] = [t2, t1];
        faceNear = i * 2 + 1;
        faceFar = i * 2 + 0;
      }

      if (t1 > tNear) {
        tNear = t1;
        faceIndex = faceNear;
      }
      if (t2 < tFar) {
        tFar = t2;
      }

      if (tNear > tFar) return null;
      if (tFar < 0) return null;
    }
  }

  if (tNear < 0 || tNear > maxDistance) return null;

  const intersectionPoint = vec3.create();
  vec3.scaleAndAdd(intersectionPoint, origin, direction, tNear);

  return {
    point: intersectionPoint,
    faceIndex: faceIndex
  };
}



async function main() {
  const gl = WebGLUtils.initWebGL();

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  WebGLUtils.resizeCanvasToWindow(gl);

  const program = await WebGLUtils.createProgram(gl, "vertex-shader.glsl", "fragment-shader.glsl");
  gl.useProgram(program);

  const textureLoc = gl.getUniformLocation(program, "u_texture");
  gl.uniform1i(textureLoc, 0);

  const lightColor = vec3.fromValues(1, 1, 1);
  const ambientColor = vec3.fromValues(0.1, 0.1, 0.1);

  let cameraPos = vec3.fromValues(2, 2, 5);
  let yaw = -Math.PI / 2;
  let pitch = 0;

  const sensitivity = 0.002;
  const movementSpeed = 0.1;
  const up = vec3.fromValues(0, 1, 0);

  let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
  let rayActive = false;
  let rayPoints = [vec3.create(), vec3.create()];  // start and end points of the ray

  // Setup ray VAO/VBO
  const rayVAO = gl.createVertexArray();
  const rayVBO = gl.createBuffer();

  gl.bindVertexArray(rayVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, rayVBO);
  gl.bufferData(gl.ARRAY_BUFFER, 2 * 3 * 4, gl.DYNAMIC_DRAW); // 2 points * 3 floats * 4 bytes

  const posLoc = gl.getAttribLocation(program, 'in_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);


  // Replace this with collision detection against sceneObject.boundingBox
  function checkCollision(pos) {
    if (!sceneObject.transformedBoundingBox) return false;
    const bb = sceneObject.transformedBoundingBox;
    const buffer = 0.2;
    return (
      pos[0] >= bb.min[0] - buffer && pos[0] <= bb.max[0] + buffer &&
      pos[1] >= bb.min[1] - buffer && pos[1] <= bb.max[1] + buffer &&
      pos[2] >= bb.min[2] - buffer && pos[2] <= bb.max[2] + buffer
    );
  }

  function tryMoveCamera(newPos) {
    if (!checkCollision(newPos)) {
      vec3.copy(cameraPos, newPos);
    }
  }

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

    if (moveForward) tryMoveCamera(forward);
    if (moveBackward) tryMoveCamera(backward);
    if (moveLeft) tryMoveCamera(left);
    if (moveRight) tryMoveCamera(rightMove);
  }

  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'w': moveForward = true; break;
      case 's': moveBackward = true; break;
      case 'a': moveLeft = true; break;
      case 'd': moveRight = true; break;
      case 'l':
      case 'L':
        if (document.pointerLockElement === gl.canvas) document.exitPointerLock();
        else gl.canvas.requestPointerLock();
        break;
    }
  });

  document.addEventListener('keyup', (e) => {
    switch (e.key) {
      case 'w': moveForward = false; break;
      case 's': moveBackward = false; break;
      case 'a': moveLeft = false; break;
      case 'd': moveRight = false; break;
    }
  });

  document.addEventListener('pointerlockchange', () => {
    console.log(document.pointerLockElement === gl.canvas ? 'Pointer locked' : 'Pointer unlocked');
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === gl.canvas) {
      yaw += e.movementX * sensitivity;
      pitch -= e.movementY * sensitivity;
      pitch = Math.max(Math.min(pitch, Math.PI / 2), -Math.PI / 2);
    }

const hotbar = document.getElementById('hotbar');
const slots = hotbar.querySelectorAll('.hotbar-slot');
let selectedIndex = 0; // 0-based

function selectSlot(index) {
  if (index < 0 || index >= slots.length) return;

  slots.forEach(slot => slot.classList.remove('selected'));
  slots[index].classList.add('selected');
  selectedIndex = index;

  console.log(`Equipped slot ${index + 1}`);
  // TODO: Add logic to equip this slot in your game
}

// Click interaction
slots.forEach((slot, idx) => {
  slot.addEventListener('click', () => selectSlot(idx));
});

// Keyboard interaction (1-9 keys)
window.addEventListener('keydown', e => {
  if (e.key >= '1' && e.key <= '9') {
    const index = parseInt(e.key) - 1;
    selectSlot(index);
  }
});

// Initialize default selection
selectSlot(0);


  });

  const sceneObject = new SceneObject(gl, "../shapes/log.obj", "../textures/log.webp", program);
  await sceneObject.init();

  // Identity matrix or apply any model transform you want here
  mat4.identity(sceneObject.modelMatrix);

  gl.canvas.addEventListener('click', (e) => {
    if (e.button === 0) {  // Left click only
      const forward = vec3.fromValues(
        Math.cos(pitch) * Math.cos(yaw),
        Math.sin(pitch),
        Math.cos(pitch) * Math.sin(yaw)
      );
      vec3.normalize(forward, forward);
  
      rayPoints[0] = vec3.clone(cameraPos);
      rayPoints[1] = vec3.create();
      vec3.scaleAndAdd(rayPoints[1], cameraPos, forward, 6); 
  
      rayActive = true;
  
      const hitInfo = rayIntersectAABBWithFace(cameraPos, forward, sceneObject.transformedBoundingBox, 6);
      if (hitInfo) {
        console.log("Ray hit the object!");
        console.log("Hit face:", faceNames[hitInfo.faceIndex]);
      } else {
        console.log("Ray missed.");
      }
    }
  });
  
  
  

  function render() {
    gl.clearColor(1, 1, 1, 1);
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
      [sceneObject.modelMatrix, viewMat, projectionMat]
    );

    WebGLUtils.setUniform3f(gl, program,
      ["u_light_direction", "u_ambient_color", "u_light_color", "u_view_direction"],
      [front, ambientColor, lightColor, cameraPos]
    );

    sceneObject.draw();
    sceneObject.drawBoundingBox();

    requestAnimationFrame(render);
  }

  render();
}

main();