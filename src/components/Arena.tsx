import { BOSS_ART } from "../lib/art";

export function Arena({
  resting,
  slain,
}: {
  resting: boolean;
  slain: boolean;
}) {
  return (
    <svg
      className={`arena-art ${slain ? "slain" : ""}`}
      viewBox="0 0 800 330"
      role="img"
      aria-label={
        slain
          ? "The forest boss defeated beneath a golden moon"
          : "A moss-covered horned forest boss guarding an ancient wheel seal"
      }
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id="stars"
          width="109"
          height="79"
          patternUnits="userSpaceOnUse"
        >
          <rect
            x="19"
            y="25"
            width="2"
            height="2"
            fill="#a5a482"
            opacity=".55"
          />
          <rect
            x="83"
            y="62"
            width="3"
            height="3"
            fill="#a5a482"
            opacity=".35"
          />
        </pattern>
      </defs>
      <path fill="#2c3c35" d="M0 0h800v330H0z" />
      <path
        fill="#424d3e"
        d="M0 110h35V98h44V82h40V64h49V52h46V40h51V30h55V22h160v8h55v10h51v12h46v12h49v18h40v16h44v12h35v220H0Z"
      />
      <path fill="#66705a" d="M304 28h192v14h18v18h12v114H274V60h12V42h18Z" />
      <path
        fill="#aaa77b"
        d="M328 32h144v12h18v14h14v18h8v88H288V76h8V58h14V44h18Z"
      />
      <path fill="#c2b485" d="M342 38h116v12h20v16h12v78H310V66h12V50h20Z" />
      <path fill="url(#stars)" d="M0 0h800v250H0Z" />
      <path
        fill="#303f32"
        d="M0 142h28v-22h28v28h34v-16h36v-24h24v28h34v-20h30v30h30v-12h48v30h216v-30h48v12h30v-30h30v20h34v-28h24v24h36v16h34v-28h28v22h28v188H0Z"
      />
      <path
        fill="#23372c"
        d="M0 211h22v-29h18v-34h16v-36h16v36h16v34h18v29h30v-15h18v-34h14v-38h14v38h14v34h18v29h24v-39h18v-34h14v-44h14v44h14v34h18v41h212v-41h18v-34h14v-44h14v44h14v34h18v39h24v-29h18v-34h14v-38h14v38h14v34h18v15h30v-29h18v-34h16v-36h16v36h16v34h18v29h22v119H0Z"
      />
      <path
        fill="#192b22"
        d="M0 80h14v28h14v28h14v24h16v24h18v36h24v110H0Zm800 0h-14v28h-14v28h-14v24h-16v24h-18v36h-24v110h100Z"
      />
      <path
        fill="#18271f"
        d="M0 282h80v-12h92v10h48v-12h54v-8h252v8h54v12h48v-10h92v12h80v48H0Z"
      />
      <path fill="#465640" d="M258 272h284v10h28v10H230v-10h28Z" />
      <path fill="#72815b" d="M282 266h236v10h-18v6H300v-6h-18Z" />
      <path
        stroke="#a3b475"
        strokeWidth="2"
        fill="none"
        opacity=".65"
        d="M360 274h80m-62-5h44m-92 12h140"
      />
      <g
        className={slain ? "boss-defeated" : "boss-figure"}
        transform="translate(272 30) scale(1.6)"
        dangerouslySetInnerHTML={{ __html: BOSS_ART }}
      />
      <g fill="#9aa56e">
        <path d="M130 272h5v-9h5v9h5v9h-15Zm509 11h5v-12h5v7h5v9h-15ZM196 295h4v-7h4v10h-8ZM591 302h4v-8h4v11h-8Z" />
        <rect x="98" y="306" width="10" height="3" />
        <rect x="679" y="300" width="12" height="3" />
      </g>
      <g fill="#d7d79a" className="fireflies">
        <rect x="214" y="123" width="3" height="3" />
        <rect x="580" y="152" width="3" height="3" />
        <rect x="176" y="218" width="3" height="3" />
        <rect x="630" y="89" width="3" height="3" />
      </g>
      {resting && !slain && (
        <g fill="#dbd9af">
          <path d="M571 91h13v4h-7v4h7v4h-13v-4h7v-4h-7Zm20-24h17v5h-10v6h10v5h-17v-5h10v-6h-10Z" />
        </g>
      )}
    </svg>
  );
}
