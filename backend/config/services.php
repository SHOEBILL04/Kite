<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'anthropic' => [
        'key' => env('ANTHROPIC_API_KEY'),
        'model' => env('ANTHROPIC_MODEL', 'claude-opus-5'),
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'ai' => [
        // groq is the only chat provider. The key is left here as a seam rather
        // than hardcoded anywhere: every credential is read from env().
        'provider' => env('AI_PROVIDER', 'groq'),

        // live       -> call the provider, falling back to cache then fixture
        // cache_only -> serve from ai_cache, never call out
        // fixture    -> serve recorded fixtures only
        'mode' => env('AI_MODE', 'fixture'),
    ],

    'groq' => [
        'key' => env('GROQ_API_KEY'),
        'model' => env('GROQ_MODEL', 'llama-3.3-70b-versatile'),

        // Higher-throughput model used when the primary is rate-limited or
        // erroring; the free tier's 30 req/min is an organization-level cap, so
        // a second key would not help but a lighter model does.
        'fallback_model' => env('GROQ_FALLBACK_MODEL', 'llama-3.1-8b-instant'),
        'temperature' => (float) env('GROQ_TEMPERATURE', 0.2),

        // A 70B model on a long extraction prompt is not fast.
        'timeout' => (int) env('GROQ_TIMEOUT', 45),
    ],

    'embeddings' => [
        // none  -> similarity runs lexically (Jaccard) only
        // local -> precomputed vectors from storage/app/embeddings/*.json
        'provider' => env('EMBEDDING_PROVIDER', 'none'),
    ],


];
