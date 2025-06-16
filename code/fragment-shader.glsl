#version 300 es
precision mediump float;

uniform vec3 u_view_direction;

uniform vec3 u_ambient_color;
uniform vec3 u_light_direction;
uniform vec3 u_light_color;

uniform sampler2D u_texture;

in vec3 v_normal;
in vec2 v_uv;

out vec4 out_color;

void main() {
vec3 ambient = u_ambient_color;

float diffuseStrength = max(dot(v_normal, u_light_direction), 0.0);
vec3 diffuse = diffuseStrength * u_light_color;

vec3 viewSource = normalize(u_view_direction);
vec3 reflectDir = reflect(-u_light_direction, v_normal);
float specularStrength = max(dot(viewSource, reflectDir), 0.0);
specularStrength = pow(specularStrength, 8.0);
vec3 specular = specularStrength * u_light_color;

vec3 lighting = ambient + diffuse + specular;

//vec3 modelColor = vec3(0.95f, 0.95f, 0.65f);
vec4 textureColor = texture(u_texture, v_uv);

out_color = vec4(lighting  , 1.0) * textureColor;

}