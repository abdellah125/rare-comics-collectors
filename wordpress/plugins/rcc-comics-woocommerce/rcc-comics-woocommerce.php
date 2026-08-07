<?php
/**
 * Plugin Name:  RCC Comics for WooCommerce
 * Plugin URI:   https://rarecomicscollectors.com
 * Description:  Graded-comic product type, custom meta fields, grade badge, and Schema.org markup.
 * Version:      1.0.0
 * Requires PHP: 8.0
 * Requires Plugins: woocommerce
 * Author:       Rare Comics Collectors
 * License:      GPL-2.0+
 */

defined( 'ABSPATH' ) || exit;

// ── 1. Register "Graded Comic" product type ───────────────────────────────────

add_filter( 'product_type_selector', function ( $types ) {
    $types['graded_comic'] = __( 'Graded Comic', 'rcc-comics' );
    return $types;
} );

add_action( 'init', function () {
    if ( ! class_exists( 'WC_Product' ) ) {
        return;
    }
    class WC_Product_Graded_Comic extends WC_Product {
        public string $product_type = 'graded_comic';
        public function __construct( $product ) {
            $this->product_type = 'graded_comic';
            parent::__construct( $product );
        }
        public function is_sold_individually(): bool { return true; }
        public function get_type(): string { return 'graded_comic'; }
    }
} );

add_filter( 'woocommerce_product_class', function ( $classname, $product_type ) {
    return $product_type === 'graded_comic' ? 'WC_Product_Graded_Comic' : $classname;
}, 10, 2 );

// ── 2. Show standard tabs for graded_comic in product editor ──────────────────

add_filter( 'woocommerce_product_data_tabs', function ( $tabs ) {
    foreach ( [ 'general', 'inventory', 'shipping' ] as $tab ) {
        if ( isset( $tabs[ $tab ] ) ) {
            $tabs[ $tab ]['class'][] = 'show_if_graded_comic';
        }
    }
    return $tabs;
} );
// ── 3. Meta-box fields panel ─────────────────────────────────────────────────

add_action( 'woocommerce_product_data_panels', function () {
    global $post;
    $v = fn( string $k ) => esc_attr( (string) get_post_meta( $post->ID, '_rcc_' . $k, true ) );
    $eras    = [ '', 'Golden Age', 'Silver Age', 'Bronze Age', 'Copper Age', 'Modern Age' ];
    $graders = [ '', 'CGC', 'CBCS', 'Raw' ];
    ?>
    <div class="options_group show_if_graded_comic">
        <p class="form-field">
            <label for="_rcc_era"><?php esc_html_e( 'Era', 'rcc-comics' ); ?></label>
            <select name="_rcc_era" id="_rcc_era">
                <?php foreach ( $eras as $era ): ?>
                    <option value="<?php echo esc_attr( $era ); ?>" <?php selected( $v( 'era' ), $era ); ?>>
                        <?php echo esc_html( $era ?: '— Select era —' ); ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </p>
        <p class="form-field">
            <label for="_rcc_grader"><?php esc_html_e( 'Grader', 'rcc-comics' ); ?></label>
            <select name="_rcc_grader" id="_rcc_grader">
                <?php foreach ( $graders as $g ): ?>
                    <option value="<?php echo esc_attr( $g ); ?>" <?php selected( $v( 'grader' ), $g ); ?>>
                        <?php echo esc_html( $g ?: '— Select grader —' ); ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </p>
        <?php
        $fields = [
            'grade'       => 'Grade (e.g. 9.2)',
            'cert_number' => 'Cert / Serial #',
            'year'        => 'Publication Year',
            'issue'       => 'Issue # (e.g. #1)',
            'key_issue'   => 'Key Issue Note',
            'writer'      => 'Writer',
            'artist'      => 'Penciller / Artist',
        ];
        foreach ( $fields as $key => $label ) : ?>
        <p class="form-field">
            <label for="_rcc_<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $label ); ?></label>
            <input type="text" name="_rcc_<?php echo esc_attr( $key ); ?>"
                   id="_rcc_<?php echo esc_attr( $key ); ?>"
                   value="<?php echo $v( $key ); ?>" />
        </p>
        <?php endforeach; ?>
    </div>
    <?php
} );
// ── 4. Save meta ─────────────────────────────────────────────────────────────

add_action( 'woocommerce_process_product_meta_graded_comic', function ( int $post_id ) {
    $keys = [ 'era','grader','grade','cert_number','year','issue','key_issue','writer','artist' ];
    foreach ( $keys as $k ) {
        $val = isset( $_POST[ "_rcc_{$k}" ] ) ? sanitize_text_field( wp_unslash( $_POST[ "_rcc_{$k}" ] ) ) : '';
        update_post_meta( $post_id, "_rcc_{$k}", $val );
    }
} );

// ── 5. Admin JS — show/hide tabs for graded_comic type ───────────────────────

add_action( 'admin_footer', function () {
    global $pagenow;
    if ( $pagenow !== 'post.php' && $pagenow !== 'post-new.php' ) return;
    ?>
    <script>
    jQuery(function($){
        $('select#product-type').on('change', function(){
            var t = $(this).val();
            $('.show_if_graded_comic').toggle(t === 'graded_comic');
        }).trigger('change');
    });
    </script>
    <?php
} );

// ── 6. Frontend — grade badge below the product title ────────────────────────

add_action( 'woocommerce_single_product_summary', function () {
    global $product;
    if ( $product->get_type() !== 'graded_comic' ) return;
    $id      = $product->get_id();
    $grader  = get_post_meta( $id, '_rcc_grader', true );
    $grade   = get_post_meta( $id, '_rcc_grade',  true );
    $era     = get_post_meta( $id, '_rcc_era',    true );
    $cert    = get_post_meta( $id, '_rcc_cert_number', true );
    $key     = get_post_meta( $id, '_rcc_key_issue',   true );
    if ( ! $grade ) return;
    $color   = rcc_grade_color( (float) $grade );
    echo '<div class="rcc-badge-row" style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px;">';
    printf( '<span class="rcc-badge" style="background:%s;color:#fff;padding:4px 10px;border-radius:6px;font-weight:700;font-size:13px;">%s %s</span>',
        esc_attr( $color ), esc_html( $grader ), esc_html( $grade ) );
    if ( $era )  printf( '<span class="rcc-badge" style="background:#f1f5f9;color:#334155;padding:4px 10px;border-radius:6px;font-size:12px;">%s</span>', esc_html( $era ) );
    if ( $cert ) printf( '<span class="rcc-badge" style="background:#f1f5f9;color:#64748b;padding:4px 10px;border-radius:6px;font-size:11px;">Cert #%s</span>', esc_html( $cert ) );
    echo '</div>';
    if ( $key ) printf( '<p class="rcc-key-issue" style="background:#fff1f2;border-left:3px solid #e11d48;padding:8px 12px;font-size:13px;margin-bottom:16px;"><strong>Key:</strong> %s</p>', esc_html( $key ) );
}, 5 );

function rcc_grade_color( float $g ): string {
    if ( $g >= 9.0 ) return '#16a34a';
    if ( $g >= 7.0 ) return '#2563eb';
    if ( $g >= 5.0 ) return '#7c3aed';
    if ( $g >= 3.0 ) return '#d97706';
    return '#dc2626';
}
// ── 7. Schema.org Product JSON-LD ─────────────────────────────────────────────

add_action( 'wp_head', function () {
    if ( ! is_product() ) return;
    global $product;
    if ( ! $product || $product->get_type() !== 'graded_comic' ) return;
    $id    = $product->get_id();
    $grade = get_post_meta( $id, '_rcc_grade',  true );
    $cert  = get_post_meta( $id, '_rcc_cert_number', true );
    $ld = [
        '@context'    => 'https://schema.org',
        '@type'       => 'Product',
        'name'        => $product->get_name(),
        'description' => wp_strip_all_tags( $product->get_description() ),
        'sku'         => $product->get_sku(),
        'brand'       => [ '@type' => 'Brand', 'name' => get_post_meta( $id, '_rcc_writer', true ) ?: 'Various' ],
        'offers'      => [
            '@type'           => 'Offer',
            'priceCurrency'   => get_woocommerce_currency(),
            'price'           => $product->get_price(),
            'availability'    => $product->is_in_stock() ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            'url'             => get_permalink( $id ),
        ],
        'additionalProperty' => array_filter( [
            $grade ? [ '@type'=>'PropertyValue','name'=>'Grade','value'=>$grade ] : null,
            $cert  ? [ '@type'=>'PropertyValue','name'=>'Cert Number','value'=>$cert ] : null,
            get_post_meta($id,'_rcc_era',true) ? ['@type'=>'PropertyValue','name'=>'Era','value'=>get_post_meta($id,'_rcc_era',true)] : null,
        ] ),
    ];
    echo '<script type="application/ld+json">' . wp_json_encode( $ld, JSON_UNESCAPED_SLASHES ) . '</script>' . "\n";
} );

// ── 8. Shortcode [rcc_comics_grid] for Elementor HTML widgets ─────────────────

add_shortcode( 'rcc_comics_grid', function ( $atts ) {
    $a = shortcode_atts( [ 'era' => '', 'limit' => 12, 'columns' => 3 ], $atts );
    $args = [
        'post_type'      => 'product',
        'posts_per_page' => (int) $a['limit'],
        'tax_query'      => [ [ 'taxonomy'=>'product_type','field'=>'slug','terms'=>'graded_comic' ] ],
        'meta_query'     => $a['era'] ? [ [ 'key'=>'_rcc_era','value'=>$a['era'],'compare'=>'=' ] ] : [],
    ];
    $loop = new WP_Query( $args );
    if ( ! $loop->have_posts() ) return '<p>No comics found.</p>';
    $cols = max( 1, min( 6, (int) $a['columns'] ) );
    ob_start();
    echo '<div class="rcc-grid" style="display:grid;grid-template-columns:repeat(' . $cols . ',1fr);gap:24px;">';
    while ( $loop->have_posts() ) {
        $loop->the_post();
        $pid   = get_the_ID();
        $p     = wc_get_product( $pid );
        $grade = get_post_meta( $pid, '_rcc_grade',  true );
        $grd   = get_post_meta( $pid, '_rcc_grader', true );
        $era   = get_post_meta( $pid, '_rcc_era',    true );
        $color = rcc_grade_color( (float) $grade );
        echo '<div class="rcc-card" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">';
        echo '<a href="' . get_permalink() . '">' . ( has_post_thumbnail() ? get_the_post_thumbnail( $pid, 'medium', ['style'=>'width:100%;height:220px;object-fit:cover;'] ) : '<div style="background:#fee2e2;height:220px;display:grid;place-items:center;font-size:32px;">📚</div>' ) . '</a>';
        echo '<div style="padding:14px;">';
        echo '<h3 style="margin:0 0 6px;font-size:15px;"><a href="' . get_permalink() . '" style="text-decoration:none;color:inherit;">' . esc_html( get_the_title() ) . '</a></h3>';
        if ( $era ) echo '<span style="font-size:11px;color:#64748b;">' . esc_html( $era ) . '</span>';
        if ( $grade ) echo '<div style="margin:8px 0;"><span style="background:' . esc_attr( $color ) . ';color:#fff;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:700;">' . esc_html( $grd . ' ' . $grade ) . '</span></div>';
        echo '<p style="font-weight:700;color:#e11d48;font-size:16px;margin:8px 0 0;">' . $p->get_price_html() . '</p>';
        echo '</div></div>';
    }
    echo '</div>';
    wp_reset_postdata();
    return ob_get_clean();
} );

