#version 300 es
precision highp float;

in vec2 v_uv;
uniform vec2 u_resolution;
uniform sampler2D u_inputStream;
uniform int u_nShuffles;
uniform float u_nStrips;

out vec4 fragColor;

// Triangle wave /\/\/\: [0, 1] -> [0, 1]
vec2 triangle(vec2 xy, float period) {
    return 1.0 - abs(fract(xy * period) * 2.0 - 1.0);
}

vec2 quilt(vec2 uv, float nShuffles, vec2 nStrips) {
    vec2 scaledUv = uv * nStrips;
    vec2 stripUv = floor(scaledUv);
    vec2 localUv = fract(scaledUv);
    return (stripUv + triangle(localUv, nShuffles)) / nStrips;
}

vec2 correctAspectRatio(vec2 uv, vec2 resolution, vec2 textureSize) {
    float canvasAspect = resolution.x / resolution.y;
    float textureAspect = textureSize.x / textureSize.y;
    vec2 scale = vec2(min(canvasAspect / textureAspect, 1.0), min(textureAspect / canvasAspect, 1.0));
    return (uv - 0.5) * scale + 0.5;
}

void main() {
    vec2 uv = v_uv;
    uv.y = 1.0 - uv.y; // Make the bottoms touch.
    uv = quilt(uv, float(u_nShuffles), vec2(u_nStrips));
    uv = correctAspectRatio(uv, u_resolution, vec2(textureSize(u_inputStream, 0)));
    uv = 1.0 - uv;
    fragColor = texture(u_inputStream, uv);
}
