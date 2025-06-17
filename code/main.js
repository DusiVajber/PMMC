import { mat4, vec3 } from 'https://cdn.jsdelivr.net/npm/gl-matrix@3.4.0/+esm';
import WebGLUtils from '../WebGLUtils.js';

class Block {
  constructor(gl, objPath, texturePath, program, position = vec3.create(), scale = 1.0) {
    this.gl = gl;
    this.objPath = objPath;
    this.texturePath = texturePath;
    this.program = program;
    this.modelMatrix = mat4.create();
    this.boundingBox = { min: vec3.create(), max: vec3.create() };
    this.position = position;
    this.scale = scale;
    
    this.transformedBoundingBox = { min: vec3.create(), max: vec3.create() };
    
    this.updateModelMatrix();
  }

  async init() {
    this.vertices = await WebGLUtils.loadOBJ(this.objPath, false);
    if (!this.vertices || this.vertices.length === 0) {
        console.error(`Failed to load OBJ vertices for ${this.objPath}.`);
        return false;
    }
    this.texture = await WebGLUtils.loadTexture(this.gl, this.texturePath);
    if (!this.texture) {
        console.error(`Failed to load texture for ${this.texturePath}.`);
        return false;
    }

    if (!this.program) {
        console.error("Attempted to initialize Block with an invalid shader program.");
        return false;
    }

    this.gl.useProgram(this.program);
    this.VAO = WebGLUtils.createVAO(this.gl, this.program, this.vertices, 8, [
      { name: 'in_position', size: 3, offset: 0 },
      { name: 'in_uv', size: 2, offset: 3 },
      { name: 'in_normal', size: 3, offset: 5 },
    ]);
    
    if (!this.VAO) {
        console.error(`Failed to create VAO for ${this.objPath}.`);
        return false;
    }
    this.calculateAABB();
    this.updateModelMatrix();
    this.updateBoundingBox();
    return true;
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

  updateModelMatrix() {
    mat4.identity(this.modelMatrix);
    mat4.translate(this.modelMatrix, this.modelMatrix, this.position);
    mat4.scale(this.modelMatrix, this.modelMatrix, vec3.fromValues(this.scale, this.scale, this.scale));
  }

  updateBoundingBox() {
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

  draw(viewMat, projectionMat) {
    if (!this.program || !this.VAO) {
        return;
    }

    this.gl.useProgram(this.program);
    WebGLUtils.setUniformMatrix4fv(this.gl, this.program,
      ["u_model", "u_view", "u_projection"],
      [this.modelMatrix, viewMat, projectionMat]
    );
    this.gl.useProgram(this.program);

    this.gl.bindVertexArray(this.VAO);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, this.vertices.length / 8);
  }

  drawBoundingBox(viewMat, projectionMat) {
    if (!this.program) {
        return;
    }

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
      [0, 1], [1, 3], [3, 2], [2, 0],
      [4, 5], [5, 7], [7, 6], [6, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    const lineVertices = [];
    edges.forEach(([start, end]) => {
      lineVertices.push(...corners[start]);
      lineVertices.push(...corners[end]);
    });

    if (!this.boundingBoxVAO) {
      this.boundingBoxVAO = this.gl.createVertexArray();
      this.gl.bindVertexArray(this.boundingBoxVAO);

      this.boundingBoxVBO = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.boundingBoxVBO);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(lineVertices), this.gl.DYNAMIC_DRAW);

      this.gl.useProgram(this.program);
      const posLoc = this.gl.getAttribLocation(this.program, 'in_position');
      if (posLoc === -1) {
          console.warn("Attribute 'in_position' not found for bounding box shader. Check vertex shader.");
      } else {
          this.gl.enableVertexAttribArray(posLoc);
          this.gl.vertexAttribPointer(posLoc, 3, this.gl.FLOAT, false, 0, 0); 
      }
    } else {
      this.gl.bindVertexArray(this.boundingBoxVAO);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.boundingBoxVBO);
      this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, new Float32Array(lineVertices));
    }

    this.gl.useProgram(this.program);
    WebGLUtils.setUniformMatrix4fv(this.gl, this.program,
      ["u_model", "u_view", "u_projection"],
      [mat4.identity(mat4.create()), viewMat, projectionMat]
    );
    this.gl.useProgram(this.program);

    this.gl.bindVertexArray(this.boundingBoxVAO);
    this.gl.drawArrays(this.gl.LINES, 0, lineVertices.length / 3);
  }
}

const faceNormals = {
  0: vec3.fromValues(-1, 0, 0),
  1: vec3.fromValues(1, 0, 0),
  2: vec3.fromValues(0, -1, 0),
  3: vec3.fromValues(0, 1, 0),
  4: vec3.fromValues(0, 0, -1),
  5: vec3.fromValues(0, 0, 1)
};

const faceNames = {
  0: 'Left (-X)',
  1: 'Right (+X)',
  2: 'Bottom (-Y)',
  3: 'Top (+Y)',
  4: 'Back (-Z)',
  5: 'Front (+Z)'
};

function AABBintersectsAABB(aabb1, aabb2) {
    return (aabb1.min[0] <= aabb2.max[0] && aabb1.max[0] >= aabb2.min[0]) &&
           (aabb1.min[1] <= aabb2.max[1] && aabb1.max[1] >= aabb2.min[1]) &&
           (aabb1.min[2] <= aabb2.max[2] && aabb1.max[2] >= aabb2.min[2]);
}

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
        faceNear = i * 2 + 0;
        faceFar = i * 2 + 1;
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
    faceIndex: faceIndex,
    t: tNear
  };
}

function isBlockAtPosition(worldObjects, position, tolerance = 0.01) {
  for (const obj of worldObjects) {
    const objGridPos = vec3.fromValues(
        Math.round(obj.position[0]),
        Math.round(obj.position[1]),
        Math.round(obj.position[2])
    );
    const targetGridPos = vec3.fromValues(
        Math.round(position[0]),
        Math.round(position[1]),
        Math.round(position[2])
    );

    if (vec3.equals(objGridPos, targetGridPos)) {
      return true;
    }
  }
  return false;
}

async function main() {
  const gl = WebGLUtils.initWebGL();
  if (!gl) {
    console.error("Failed to get WebGL context. Exiting.");
    return;
  }

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  WebGLUtils.resizeCanvasToWindow(gl);

  console.log("Attempting to create shader program...");
  const program = await WebGLUtils.createProgram(gl, "vertex-shader.glsl", "fragment-shader.glsl");

  if (!program) {
    console.error("Failed to create shader program. Check WebGLUtils logs above for GLSL errors. Aborting.");
    return;
  }
  console.log("Shader program created successfully.");

  gl.useProgram(program);
  const textureLoc = gl.getUniformLocation(program, "u_texture");
  if (textureLoc === null) {
      console.warn("Uniform 'u_texture' not found in shader program.");
  }


  const lightColor = vec3.fromValues(1, 1, 1);
  const ambientColor = vec3.fromValues(0.1, 0.1, 0.1);

  let cameraPos = vec3.fromValues(2, 2, 5);
  let yaw = -Math.PI / 2;
  let pitch = 0;

  const sensitivity = 0.002;
  const movementSpeed = 0.25;
  const up = vec3.fromValues(0, 1, 0);

  let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;

  const worldObjects = [];
  const blockTypes = [
    { obj: "../shapes/cube.obj", texture: "../textures/dirt.webp" },
    { obj: "../shapes/grass.obj", texture: "../textures/grass.webp" },
    { obj: "../shapes/log.obj", texture: "../textures/log.webp" },
    { obj: "../shapes/log.obj", texture: "../textures/plank.webp" },
    { obj: "../shapes/grass.obj", texture: "../textures/brick.webp" },
    { obj: "../shapes/grass.obj", texture: "../textures/stone.webp" },
  ];
  
  const blockUnitSize = 2.0 * 1.0; 

  const playerHeight = 0.01; 
  const playerWidth = 0.01;  
  const playerCollisionOffset = vec3.fromValues(0, 0, 0); 

  console.log("Initializing initial block...");
  gl.useProgram(program);
  const initialBlock = new Block(gl, blockTypes[0].obj, blockTypes[0].texture, program, vec3.fromValues(0, 0, 0), 1.0);
  const initSuccess = await initialBlock.init();
  if (!initSuccess) {
      console.error("Failed to initialize initial block. Aborting.");
      return;
  }
  worldObjects.push(initialBlock);
  console.log("Initial block initialized.");

  const hotbar = document.getElementById('hotbar');
  const slots = hotbar.querySelectorAll('.hotbar-slot');
  let selectedIndex = 0;

  function selectSlot(index) {
    if (index < 0 || index >= slots.length) return;
    slots.forEach(slot => slot.classList.remove('selected'));
    slots[index].classList.add('selected');
    selectedIndex = index;
    console.log(`Equipped slot ${index + 1}: ${blockTypes[selectedIndex] ? blockTypes[selectedIndex].obj : 'None'}`);
  }
  slots.forEach((slot, idx) => {
    slot.addEventListener('click', () => selectSlot(idx));
  });
  window.addEventListener('keydown', e => {
    if (e.key >= '1' && e.key <= '9') {
      const index = parseInt(e.key) - 1;
      selectSlot(index);
    }
  });
  selectSlot(0);

  function checkCollision(targetPos) {
    const playerAABB = {
      min: vec3.fromValues(
        targetPos[0] + playerCollisionOffset[0] - playerWidth / 2,
        targetPos[1] + playerCollisionOffset[1] - playerHeight / 2,
        targetPos[2] + playerCollisionOffset[2] - playerWidth / 2
      ),
      max: vec3.fromValues(
        targetPos[0] + playerCollisionOffset[0] + playerWidth / 2,
        targetPos[1] + playerCollisionOffset[1] + playerHeight / 2,
        targetPos[2] + playerCollisionOffset[2] + playerWidth / 2
      ),
    };

    for (const obj of worldObjects) {
      obj.updateBoundingBox();
      if (AABBintersectsAABB(playerAABB, obj.transformedBoundingBox)) {
        console.log("Collision detected with object at:", obj.position);
        return true;
      }
    }
    return false;
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

    const movementDelta = vec3.create();
    if (moveForward) vec3.scaleAndAdd(movementDelta, movementDelta, front, movementSpeed);
    if (moveBackward) vec3.scaleAndAdd(movementDelta, movementDelta, front, -movementSpeed);
    if (moveLeft) vec3.scaleAndAdd(movementDelta, movementDelta, right, -movementSpeed);
    if (moveRight) vec3.scaleAndAdd(movementDelta, movementDelta, right, movementSpeed);

    let newXPos = vec3.clone(cameraPos);
    vec3.add(newXPos, newXPos, vec3.fromValues(movementDelta[0], 0, 0));
    if (!checkCollision(newXPos)) {
        cameraPos[0] = newXPos[0];
    }

    let newYPos = vec3.clone(cameraPos);
    vec3.add(newYPos, newYPos, vec3.fromValues(0, movementDelta[1], 0));
    if (!checkCollision(newYPos)) {
        cameraPos[1] = newYPos[1];
    }

    let newZPos = vec3.clone(cameraPos);
    vec3.add(newZPos, newZPos, vec3.fromValues(0, 0, movementDelta[2]));
    if (!checkCollision(newZPos)) {
        cameraPos[2] = newZPos[2];
    }
  }

  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'w': moveForward = true; break;
      case 's': moveBackward = true; break;
      case 'a': moveLeft = true; break;
      case 'd': moveRight = true; break;
      case 'l': case 'L':
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
  });

  gl.canvas.addEventListener('click', async (e) => {
    if (e.button === 0) {
        const forward = vec3.fromValues(
            Math.cos(pitch) * Math.cos(yaw),
            Math.sin(pitch),
            Math.cos(pitch) * Math.sin(yaw)
        );
        vec3.normalize(forward, forward);

        let closestHit = null;
        let closestT = Infinity;
        let clickedObject = null;
        let clickedObjectIndex = -1;

        for (let i = 0; i < worldObjects.length; i++) {
            const obj = worldObjects[i];
            obj.updateBoundingBox();
            const hitInfo = rayIntersectAABBWithFace(cameraPos, forward, obj.transformedBoundingBox, 18);
            if (hitInfo && hitInfo.t < closestT) {
                closestT = hitInfo.t;
                closestHit = hitInfo;
                clickedObject = obj;
                clickedObjectIndex = i;
            }
        }

        if (clickedObject && clickedObjectIndex !== -1) {
            console.log("Destroying block!");
            worldObjects.splice(clickedObjectIndex, 1);
        }
    } else if (e.button === 2) {
      const forward = vec3.fromValues(
        Math.cos(pitch) * Math.cos(yaw),
        Math.sin(pitch),
        Math.cos(pitch) * Math.sin(yaw)
      );
      vec3.normalize(forward, forward);

      let closestHit = null;
      let closestT = Infinity;
      let clickedObject = null;

      for (const obj of worldObjects) {
        obj.updateBoundingBox();
        const hitInfo = rayIntersectAABBWithFace(cameraPos, forward, obj.transformedBoundingBox, 18);
        if (hitInfo && hitInfo.t < closestT) {
          closestT = hitInfo.t;
          closestHit = hitInfo;
          clickedObject = obj;
        }
      }

      if (closestHit && clickedObject) {
        console.log("Ray hit an object!");
        console.log("Hit face:", faceNames[closestHit.faceIndex]);

        const faceNormal = faceNormals[closestHit.faceIndex];

        const snappedClickedPosition = vec3.fromValues(
          Math.round(clickedObject.position[0] / blockUnitSize) * blockUnitSize,
          Math.round(clickedObject.position[1] / blockUnitSize) * blockUnitSize,
          Math.round(clickedObject.position[2] / blockUnitSize) * blockUnitSize
        );

        const newBlockPosition = vec3.create();
        vec3.scaleAndAdd(newBlockPosition, snappedClickedPosition, faceNormal, blockUnitSize);

        const newBlockTempAABB = {
            min: vec3.fromValues(newBlockPosition[0] - (blockUnitSize / 2), newBlockPosition[1] - (blockUnitSize / 2), newBlockPosition[2] - (blockUnitSize / 2)),
            max: vec3.fromValues(newBlockPosition[0] + (blockUnitSize / 2), newBlockPosition[1] + (blockUnitSize / 2), newBlockPosition[2] + (blockUnitSize / 2)),
        };

        const currentPlayerAABB = {
            min: vec3.fromValues(
                cameraPos[0] + playerCollisionOffset[0] - playerWidth / 2,
                cameraPos[1] + playerCollisionOffset[1] - playerHeight / 2,
                cameraPos[2] + playerCollisionOffset[2] - playerWidth / 2
            ),
            max: vec3.fromValues(
                cameraPos[0] + playerCollisionOffset[0] + playerWidth / 2,
                cameraPos[1] + playerCollisionOffset[1] + playerHeight / 2,
                cameraPos[2] + playerCollisionOffset[2] + playerWidth / 2
            ),
        };

        if (!isBlockAtPosition(worldObjects, newBlockPosition) && !AABBintersectsAABB(newBlockTempAABB, currentPlayerAABB)) {
          const selectedBlockType = blockTypes[selectedIndex];
          if (selectedBlockType) {
            gl.useProgram(program);
            const newBlock = new Block(gl, selectedBlockType.obj, selectedBlockType.texture, program, newBlockPosition, 1.0);
            console.log(`Attempting to place new block at: [${newBlockPosition[0]}, ${newBlockPosition[1]}, ${newBlockPosition[2]}]`);
            const newBlockInitSuccess = await newBlock.init();
            if (newBlockInitSuccess) {
                worldObjects.push(newBlock);
                console.log("New block placed successfully!");
            } else {
                console.error("Failed to initialize new block, not adding to world.");
            }
          } else {
            console.warn("No block type selected or defined for this hotbar slot.");
          }
        } else {
          console.log("Cannot place block: space already occupied or intersects player.");
        }
      } else {
        console.log("Ray missed.");
      }
    }
  });

  function render() {
    WebGLUtils.resizeCanvasToWindow(gl);

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

    gl.useProgram(program);
    WebGLUtils.setUniform3f(gl, program,
      ["u_light_direction", "u_ambient_color", "u_light_color", "u_view_direction"],
      [front, ambientColor, lightColor, cameraPos]
    );
    gl.useProgram(program);
    gl.uniform1i(textureLoc, 0);

    for (const obj of worldObjects) {
      obj.updateModelMatrix();
      obj.draw(viewMat, projectionMat);
      obj.drawBoundingBox(viewMat, projectionMat);
    }

    requestAnimationFrame(render);
  }

  render();
}

main();