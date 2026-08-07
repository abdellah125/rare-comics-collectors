<?php
/**
 * Plugin Name:  RCC CGC Cert Verifier
 * Description:  Live CGC certificate lookup widget — shortcode [rcc_cert_verify].
 * Version:      1.0.0
 * Requires PHP: 8.0
 * Requires Plugins: woocommerce
 * Author:       Rare Comics Collectors
 * License:      GPL-2.0+
 */

defined( 'ABSPATH' ) || exit;

// ── Settings page for API key ──────────────────────────────────────────────

add_action( 'admin_menu', function () {
    add_options_page( 'RCC Cert Verifier', 'RCC Cert Verifier', 'manage_options', 'rcc-cert-verifier', function () {
        if ( isset( $_POST['rcc_cgc_api_key'] ) ) {
            update_option( 'rcc_cgc_api_key', sanitize_text_field( wp_unslash( $_POST['rcc_cgc_api_key'] ) ) );
            echo '<div class="notice notice-success"><p>Saved.</p></div>';
        }
        $key = esc_attr( (string) get_option( 'rcc_cgc_api_key', '' ) );
        echo '<div class="wrap"><h1>RCC Cert Verifier Settings</h1>
        <p>Enter your CGC Dealer API key. Apply at <a href="https://www.cgccomics.com/dealer-program/" target="_blank">cgccomics.com/dealer-program</a>.</p>
        <form method="post">
          <table class="form-table"><tr>
            <th>CGC API Key</th>
            <td><input type="text" name="rcc_cgc_api_key" value="' . $key . '" style="width:340px;" /></td>
          </tr></table>' . wp_nonce_field( 'rcc_cert_save' ) . '<p><button class="button-primary">Save</button></p></form></div>';
    } );
} );

// ── Enqueue inline JS for AJAX lookup ─────────────────────────────────────

add_action( 'wp_enqueue_scripts', function () {
    wp_add_inline_script( 'jquery', '
    function rccVerifyCert(e){
        e.preventDefault();
        var num = document.getElementById("rcc-cert-input").value.trim();
        if(!num) return;
        var out = document.getElementById("rcc-cert-result");
        out.innerHTML = "<em>Looking up…</em>";
        fetch("' . esc_url( admin_url( 'admin-ajax.php' ) ) . '?action=rcc_cert_lookup&cert=" + encodeURIComponent(num))
            .then(r=>r.json()).then(function(d){
                if(d.success){
                    var c=d.data;
                    out.innerHTML = "<div style=\'border:1px solid #bbf7d0;background:#f0fdf4;padding:12px 16px;border-radius:8px;\'>"
                        +"<strong>"+c.title+" #"+c.issue+" ("+c.year+")</strong><br>"
                        +"<span style=\'color:#16a34a;font-weight:700;font-size:18px;\'>"+c.grader+" "+c.grade+"</span> &nbsp;"
                        +"<span style=\'background:#dcfce7;padding:2px 8px;border-radius:4px;font-size:12px;\'>"+c.label+"</span><br>"
                        +"<small style=\'color:#64748b;\'>Cert #"+c.certNumber+"</small></div>";
                } else {
                    out.innerHTML="<div style=\'color:#dc2626;padding:10px;\'>"+d.data+"</div>";
                }
            }).catch(function(){ out.innerHTML="<div style=\'color:#dc2626;\'>Network error. Try again.</div>"; });
    }' );
} );

// ── AJAX handler ──────────────────────────────────────────────────────────

add_action( 'wp_ajax_rcc_cert_lookup',        'rcc_do_cert_lookup' );
add_action( 'wp_ajax_nopriv_rcc_cert_lookup', 'rcc_do_cert_lookup' );

function rcc_do_cert_lookup(): never {
    $cert = sanitize_text_field( wp_unslash( $_GET['cert'] ?? '' ) );
    if ( ! $cert || ! preg_match( '/^\d{6,13}$/', $cert ) ) {
        wp_send_json_error( 'Invalid cert number format.' );
    }
    $api_key = get_option( 'rcc_cgc_api_key', '' );
    if ( ! $api_key ) {
        // Fallback: link to public cert lookup
        wp_send_json_success( [
            'certNumber' => $cert,
            'title'      => 'Cert lookup',
            'issue'      => '',
            'year'       => '',
            'grade'      => 'Visit cgccomics.com/certlookup to verify',
            'grader'     => 'CGC',
            'label'      => 'Add your API key in Settings → RCC Cert Verifier',
        ] );
    }
    $url  = "https://api.cgccomics.com/api/cert/1?certNumber={$cert}";
    $resp = wp_remote_get( $url, [ 'headers' => [ 'Authorization' => "Bearer {$api_key}" ] ] );
    if ( is_wp_error( $resp ) ) wp_send_json_error( 'CGC API unreachable.' );
    $data = json_decode( wp_remote_retrieve_body( $resp ), true );
    if ( empty( $data['grade'] ) ) wp_send_json_error( 'Cert not found in CGC database.' );
    wp_send_json_success( [
        'certNumber' => $cert,
        'title'      => $data['title']        ?? '',
        'issue'      => $data['issueNumber']   ?? '',
        'year'       => $data['year']          ?? '',
        'grade'      => $data['grade']         ?? '',
        'grader'     => 'CGC',
        'label'      => $data['gradingLabel']  ?? '',
    ] );
}

// ── Shortcode [rcc_cert_verify] ──────────────────────────────────────────

add_shortcode( 'rcc_cert_verify', function () {
    return '<div style="max-width:480px;">
        <form onsubmit="rccVerifyCert(event)" style="display:flex;gap:8px;margin-bottom:12px;">
            <input id="rcc-cert-input" type="text" placeholder="Enter CGC cert number…"
                   style="flex:1;padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;" />
            <button type="submit"
                    style="background:#e11d48;color:#fff;padding:10px 20px;border:none;border-radius:8px;font-weight:700;cursor:pointer;">
                Verify
            </button>
        </form>
        <div id="rcc-cert-result"></div>
    </div>';
} );
