'use client';

import Script from 'next/script';
import { GOOGLE_TAG_ID, IS_GTM_CONTAINER, MS_UET_TAG_ID } from '../lib/ads';

/**
 * Env-gated ad/measurement tag loader — renders nothing until
 * NEXT_PUBLIC_GTM_ID or NEXT_PUBLIC_MS_UET_ID is set. GTM-XXX ids get the
 * container snippet; G-/AW- ids get gtag.js. Mounted once in the root layout.
 */
export default function AdTracking() {
  if (!GOOGLE_TAG_ID && !MS_UET_TAG_ID) return null;
  return (
    <>
      {GOOGLE_TAG_ID ? (
        IS_GTM_CONTAINER ? (
          <Script id="gtm-init" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GOOGLE_TAG_ID}');`}
          </Script>
        ) : (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', '${GOOGLE_TAG_ID}');`}
            </Script>
          </>
        )
      ) : null}
      {MS_UET_TAG_ID ? (
        <Script id="uet-init" strategy="afterInteractive">
          {`(function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[];f=function(){var o={ti:"${MS_UET_TAG_ID}",enableAutoSpaTracking:true};o.q=w[u];w[u]=new UET(o);w[u].push("pageLoad")};n=d.createElement(t);n.src=r;n.async=1;n.onload=n.onreadystatechange=function(){var s=this.readyState;s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)};i=d.getElementsByTagName(t)[0];i.parentNode.insertBefore(n,i)})(window,document,"script","//bat.bing.com/bat.js","uetq");`}
        </Script>
      ) : null}
    </>
  );
}
