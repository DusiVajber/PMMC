#version 300 es
precision mediump float;

uniform mat4 u_model; // Model matrix
uniform mat4 u_view;  // View matrix
uniform mat4 u_projection; // Projection matrix

in vec3 in_position;
in vec3 in_normal;
in vec2 in_uv;

out vec2 v_uv;
out vec3 v_normal;


void main() {
gl_Position = u_projection * u_view * u_model * vec4(in_position, 1.0f);

mat3 normal_transform = inverse(transpose(mat3(u_model)));
v_normal = normalize(normal_transform * in_normal);
v_uv=in_uv;
}
