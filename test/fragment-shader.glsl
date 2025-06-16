#version 300 es
precision mediump float;

uniform vec3 u_light_direction;
uniform vec3 u_ambient_color;
uniform vec3 u_light_color;
uniform sampler2D u_texture;

in vec3 v_normal;
in vec2 v_uv;

out vec4 out_color;

void main() {
   vec3 lightDir = -normalize(u_light_direction);
   vec3 normal = normalize(v_normal);
   vec3 ambient = u_ambient_color;


  float diffuseStrength = max(dot(normal, lightDir), 0.0);
  vec3 diffuse = diffuseStrength * u_light_color;

  vec3 viewDir = normalize(-v_normal); 
  vec3 reflectDir = reflect(-lightDir, normal);
  float specularStrength = pow(max(dot(viewDir, reflectDir), 0.0), 8.0);
  vec3 specular = specularStrength * u_light_color;


  vec3 lighting = ambient + diffuse + specular;


  vec4 textureColor = texture(u_texture, v_uv);


  out_color = vec4(lighting, 1.0) * textureColor;
}