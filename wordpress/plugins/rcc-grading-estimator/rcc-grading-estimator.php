<?php
/**
 * Plugin Name:  RCC Grading Estimator
 * Description:  AI-powered comic condition estimator via photo upload — shortcode [rcc_grading_estimator].
 * Version:      1.0.0
 * Requires PHP: 8.0
 * Author:       Rare Comics Collectors
 * License:      GPL-2.0+
 */

defined( 'ABSPATH' ) || exit;

// ── Settings ──────────────────────────────────────────────────────────────────

add_action( 'admin_menu', function () {
    add_options_page( 'RCC Grading Estimator', 'RCC Grading Estimator', 'manage_options', 'rcc-grading-est', function () {
        if ( isset( $_POST['rcc_ai_key'] ) ) {
            update_option( 'rcc_ai_key',      sanitize_text_field( wp_unslash( $_POST['rcc_ai_key'] ) ) );
            update_option( 'rcc_ai_provider', sanitize_text_field( wp_unslash( $_POST['rcc_ai_provider'] ?? 'anthropic' ) ) );
            echo '<div class="notice notice-success"><p>Saved.</p></div>';
        }
        $key      = esc_attr( (string) get_option( 'rcc_ai_key', '' ) );
        $provider = get_option( 'rcc_ai_provider', 'anthropic' );
        echo '<div class="wrap"><h1>RCC Grading Estimator</h1>
        <form method="post"><table class="form-table">
          <tr><th>AI Provider</th><td>
            <select name="rcc_ai_provider">
              <option value="anthropic"' . selected($provider,'anthropic',false) . '>Anthropic Claude (Recommended)</option>
              <option value="openai"' .    selected($provider,'openai',false) .    '>OpenAI GPT-4o</option>
            </select>
          </td></tr>
          <tr><th>API Key</th><td>
            <input type="text" name="rcc_ai_key" value="' . $key . '" style="width:380px;" />
            <p class="description">Get a Claude key at <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>.</p>
          </td></tr>
        </table>' . wp_nonce_field( 'rcc_ai_save' ) . '<p><button class="button-primary">Save</button></p></form></div>';
    } );
} );

// ── AJAX: receive photos, call AI, return grade estimate ──────────────────────

add_action( 'wp_ajax_rcc_grade_estimate',        'rcc_do_grade_estimate' );
add_action( 'wp_ajax_nopriv_rcc_grade_estimate', 'rcc_do_grade_estimate' );

function rcc_do_grade_estimate(): never {
    $api_key  = get_option( 'rcc_ai_key', '' );
    $provider = get_option( 'rcc_ai_provider', 'anthropic' );

    if ( ! $api_key ) {
        wp_send_json_error( 'No API key configured. Go to Settings → RCC Grading Estimator.' );
    }

    // Collect base64-encoded images from POST (max 4)
    $images = [];
    foreach ( $_FILES as $file ) {
        if ( $file['error'] !== UPLOAD_ERR_OK ) continue;
        $mime = $file['type'];
        if ( ! in_array( $mime, [ 'image/jpeg', 'image/png', 'image/webp' ], true ) ) continue;
        $images[] = [ 'b64' => base64_encode( file_get_contents( $file['tmp_name'] ) ), 'mime' => $mime ];
        if ( count( $images ) >= 4 ) break;
    }

    if ( empty( $images ) ) wp_send_json_error( 'Please upload at least one photo.' );

    $system = 'You are a professional CGC comic book grader. Analyse the uploaded photos and return ONLY valid JSON with keys: estimatedGrade (string range like "5.0–6.0"), confidence ("low"|"medium"|"high"), issues (string[] of defects found), recommendation (string 40 words max).';

    if ( $provider === 'anthropic' ) {
        $content = array_map( fn($img) => [ 'type'=>'image','source'=>['type'=>'base64','media_type'=>$img['mime'],'data'=>$img['b64']] ], $images );
        $content[] = [ 'type' => 'text', 'text' => 'Grade this comic. Respond with JSON only.' ];
        $body = [ 'model'=>'claude-opus-5','max_tokens'=>512,'system'=>$system,'messages'=>[['role'=>'user','content'=>$content]] ];
        $resp = wp_remote_post( 'https://api.anthropic.com/v1/messages', [
            'headers' => [ 'x-api-key'=>$api_key,'anthropic-version'=>'2023-06-01','content-type'=>'application/json' ],
            'body'    => wp_json_encode( $body ),
            'timeout' => 30,
        ] );
        $raw = json_decode( wp_remote_retrieve_body( $resp ), true );
        $text = $raw['content'][0]['text'] ?? '';
    } else {
        $msgs = [ [ 'role'=>'system','content'=>$system ] ];
        $uc   = array_map( fn($img) => [ 'type'=>'image_url','image_url'=>['url'=>'data:'.$img['mime'].';base64,'.$img['b64']] ], $images );
        $uc[] = [ 'type'=>'text','text'=>'Grade this comic. Respond with JSON only.' ];
        $msgs[] = [ 'role'=>'user','content'=>$uc ];
        $resp = wp_remote_post( 'https://api.openai.com/v1/chat/completions', [
            'headers' => [ 'Authorization'=>"Bearer {$api_key}",'Content-Type'=>'application/json' ],
            'body'    => wp_json_encode( [ 'model'=>'gpt-4o','max_tokens'=>512,'messages'=>$msgs ] ),
            'timeout' => 30,
        ] );
        $raw  = json_decode( wp_remote_retrieve_body( $resp ), true );
        $text = $raw['choices'][0]['message']['content'] ?? '';
    }

    $result = json_decode( trim( $text ), true );
    if ( ! $result ) wp_send_json_error( 'AI returned unexpected format. Try again.' );
    wp_send_json_success( $result );
}

// ── Shortcode [rcc_grading_estimator] ─────────────────────────────────────────

add_shortcode( 'rcc_grading_estimator', function () {
    $ajax = esc_url( admin_url( 'admin-ajax.php' ) );
    ob_start(); ?>
    <div id="rcc-estimator" style="max-width:600px;font-family:system-ui,sans-serif;">
      <h3 style="color:#e11d48;">Free Comic Grade Estimator</h3>
      <p style="color:#64748b;font-size:14px;">Upload up to 4 photos (cover front &amp; back, spine, staples). Our AI will estimate the CGC grade range.</p>
      <form id="rcc-est-form" enctype="multipart/form-data">
        <input type="file" name="photo[]" accept="image/*" multiple style="margin-bottom:12px;display:block;" />
        <button type="submit" style="background:#e11d48;color:#fff;padding:10px 24px;border:none;border-radius:8px;font-weight:700;cursor:pointer;">
          Estimate Grade
        </button>
      </form>
      <div id="rcc-est-result" style="margin-top:16px;"></div>
    </div>
    <script>
    document.getElementById('rcc-est-form').addEventListener('submit',function(e){
        e.preventDefault();
        var res=document.getElementById('rcc-est-result');
        res.innerHTML='<em style="color:#64748b;">Analysing photos…</em>';
        var fd=new FormData(this);
        fd.append('action','rcc_grade_estimate');
        fetch('<?php echo $ajax; ?>',{method:'POST',body:fd})
            .then(r=>r.json()).then(function(d){
                if(d.success){
                    var c=d.data;
                    res.innerHTML='<div style="border:1px solid #bbf7d0;background:#f0fdf4;padding:16px;border-radius:10px;">'
                        +'<strong style="font-size:20px;color:#15803d;">Estimated Grade: '+c.estimatedGrade+'</strong>'
                        +' <small>(confidence: '+c.confidence+')</small>'
                        +(c.issues&&c.issues.length?'<ul style="margin:10px 0 0;padding-left:18px;">'+c.issues.map(i=>'<li style="font-size:13px;color:#334155;">'+i+'</li>').join('')+'</ul>':'')
                        +'<p style="margin:10px 0 0;font-size:13px;color:#64748b;">'+c.recommendation+'</p>'
                        +'<p style="margin:10px 0 0;font-size:12px;color:#94a3b8;">This is an estimate only. Submit to CGC for an official grade.</p>'
                        +'</div>';
                } else { res.innerHTML='<p style="color:#dc2626;">'+d.data+'</p>'; }
            }).catch(function(){ res.innerHTML='<p style="color:#dc2626;">Error. Please try again.</p>'; });
    });
    </script>
    <?php return ob_get_clean();
} );
