import { useConnect } from "wagmi";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { useState } from "react";

const mobileWallets = [
  {
    name: "MetaMask",
    icon: "metaMask.svg",
    href: (url: string) =>
      `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    name: "Coinbase Wallet",
    icon: "coinbase.svg",
    href: (url: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
  },
  {
    name: "Rabby",
    icon: "rabby.svg",
    href: (url: string) =>
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(url)}`,
  },
  {
    name: "Phantom",
    icon: "phantom.svg",
    href: (url: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}`,
  },
];
export function WalletSheet({ onClose }: { onClose: () => void }) {
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const [error, setError] = useState("");
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter(
    (c) =>
      !(c.id === "injected" && named) && !(mobile && c.type === "injected"),
  );
  return (
    <Dialog title="Join the raid" onClose={onClose} className="wallet-dialog">
      <p className="dialog-intro">
        Connect a wallet, then sign to join. No gas, token approval, or
        transaction.
      </p>
      <div className="wallet-list">
        {mobile &&
          mobileWallets.map((w) => (
            <a className="wallet-row" key={w.name} href={w.href(location.href)}>
              <img src={`./${w.icon}`} alt="" width="28" height="28" />
              <span>Open in {w.name}</span>
              <Icon name="external" size={16} />
            </a>
          ))}
        {listed.map((c) => (
          <button
            className="wallet-row"
            key={c.uid}
            disabled={isPending}
            onClick={async () => {
              setError("");
              try {
                await connectAsync({ connector: c });
                onClose();
              } catch (e) {
                const code = (e as { cause?: { code?: number } }).cause?.code;
                setError(
                  code === 4001
                    ? "Connection declined. Choose a wallet to try again."
                    : c.id === "injected" && !named
                      ? "No browser wallet found. Install a wallet extension or choose Coinbase below."
                      : "Unable to connect. Check the wallet prompt and try again.",
                );
              }
            }}
          >
            {c.icon ? (
              <img src={c.icon} alt="" width="28" height="28" />
            ) : c.id === "coinbaseWalletSDK" ? (
              <img src="./coinbase.svg" alt="" width="28" height="28" />
            ) : (
              <Icon name="wallet" size={28} />
            )}
            <span>
              {c.id === "injected"
                ? "Browser wallet"
                : c.id === "coinbaseWalletSDK"
                  ? mobile
                    ? "Coinbase Smart Wallet"
                    : "Coinbase Wallet"
                  : c.name}
              {isPending && variables?.connector === c ? " · Opening…" : ""}
            </span>
            <Icon name="arrow" size={16} />
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error-note">
          {error}
        </p>
      )}
      <p className="fine-print">
        <Icon name="shield" size={16} /> Signatures only. Your assets stay in
        your wallet.
      </p>
    </Dialog>
  );
}
