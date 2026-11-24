// The treasures' look: a matcap (the surface colour is read from a small picture of a lit sphere, by the direction the
// surface faces the viewer), unlit, so a treasure looks the same in any world's lighting. Upstream's Gold and Diamond
// were Poiyomi Toon materials with "matcap replace" (built-in pipeline); this is that idea for URP, small enough for
// Quest. Written for this port (MIT). Opaque by default; the diamond material sets the blend and depth-write properties
// for see-through.
Shader "TreasureHunt/Matcap"
{
    Properties
    {
        _MatCap ("Matcap", 2D) = "white" {}
        _Color ("Tint", Color) = (1, 1, 1, 1)
        [Enum(UnityEngine.Rendering.BlendMode)] _SrcBlend ("Source blend", Float) = 1
        [Enum(UnityEngine.Rendering.BlendMode)] _DstBlend ("Destination blend", Float) = 0
        [Toggle] _ZWrite ("Depth write", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" }
        Pass
        {
            Name "Matcap"
            Tags { "LightMode" = "UniversalForward" }
            Blend [_SrcBlend] [_DstBlend]
            ZWrite [_ZWrite]
            Cull Back

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            TEXTURE2D(_MatCap);
            SAMPLER(sampler_MatCap);
            CBUFFER_START(UnityPerMaterial)
                float4 _MatCap_ST;
                half4 _Color;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            Varyings vert(Attributes input)
            {
                Varyings output;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                float3 normalVS = normalize(mul((float3x3)UNITY_MATRIX_V, TransformObjectToWorldNormal(input.normalOS)));
                output.uv = normalVS.xy * 0.5 + 0.5;
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
                return SAMPLE_TEXTURE2D(_MatCap, sampler_MatCap, input.uv) * _Color;
            }
            ENDHLSL
        }
    }
    FallBack Off
}
