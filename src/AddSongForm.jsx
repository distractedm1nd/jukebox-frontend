import React, { useState } from "react";
import { sha256 } from "js-sha256";
import { Music, Plus } from "lucide-react";
import { StargateClient, SigningStargateClient } from "@cosmjs/stargate";
import { Registry, DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { defaultRegistryTypes } from "@cosmjs/stargate";

// Create custom message type
const MsgPayForBlobs = {
  typeUrl: "/celestia.blob.v1.MsgPayForBlobs",

  // Implement required methods
  aminoType: "celestia/MsgPayForBlobs",

  create: (value) => ({
    ...value,
    typeUrl: "/celestia.blob.v1.MsgPayForBlobs",
  }),

  encode: (message) => {
    const encoded = new Uint8Array([
      // Version (1 byte)
      0,
      // Add namespaces
      ...message.namespaces.reduce((acc, ns) => [...acc, ...ns], []),
      // Add blob sizes
      ...message.blob_sizes.reduce((acc, size) => {
        const bytes = new Uint8Array(4);
        new DataView(bytes.buffer).setUint32(0, size, true);
        return [...acc, ...bytes];
      }, []),
      // Add share commitments
      ...message.share_commitments.reduce((acc, sc) => [...acc, ...sc], []),
      // Add share versions
      ...message.share_versions.reduce((acc, version) => {
        const bytes = new Uint8Array(4);
        new DataView(bytes.buffer).setUint32(0, version, true);
        return [...acc, ...bytes];
      }, []),
    ]);
    return encoded;
  },

  decode: (value) => {
    let offset = 0;

    // Skip version byte
    offset += 1;

    // Read namespaces (fixed size of 8 bytes each)
    const namespaces = [];
    while (offset < value.length && namespaces.length < 1) {
      namespaces.push(value.slice(offset, offset + 8));
      offset += 8;
    }

    // Read blob sizes (fixed size of 4 bytes each)
    const blob_sizes = [];
    while (offset < value.length && blob_sizes.length < namespaces.length) {
      const size = new DataView(value.buffer).getUint32(offset, true);
      blob_sizes.push(size);
      offset += 4;
    }

    // Read share commitments (variable size, but we know it's 1 per namespace)
    const share_commitments = [];
    while (
      offset < value.length &&
      share_commitments.length < namespaces.length
    ) {
      share_commitments.push(value.slice(offset, offset + 32));
      offset += 32;
    }

    // Read share versions (fixed size of 4 bytes each)
    const share_versions = [];
    while (offset < value.length && share_versions.length < namespaces.length) {
      const version = new DataView(value.buffer).getUint32(offset, true);
      share_versions.push(version);
      offset += 4;
    }

    return {
      namespaces,
      blob_sizes,
      share_commitments,
      share_versions,
    };
  },

  fromJSON: (jsonValue) => {
    return {
      ...jsonValue,
      typeUrl: "/celestia.blob.v1.MsgPayForBlobs",
    };
  },

  toJSON: (message) => {
    return {
      ...message,
    };
  },

  fromPartial: (obj) => {
    return {
      ...obj,
      typeUrl: "/celestia.blob.v1.MsgPayForBlobs",
    };
  },
};

const getCustomRegistry = () => {
  const registry = new Registry(defaultRegistryTypes);
  registry.register("/celestia.blob.v1.MsgPayForBlobs", {
    typeUrl: "/celestia.blob.v1.MsgPayForBlobs",
    encode: (msg) => ({
      finish: () => {
        const namespaces = new Uint8Array([...msg.namespaces[0]]);

        // According to the Blob proto
        const blob = new Uint8Array([
          0x0a,
          msg.namespaces[0].length,
          ...msg.namespaces[0], // field 1 - namespace_id
          0x12,
          msg.data[0].length,
          ...msg.data[0], // field 2 - data
          0x18,
          msg.share_versions[0], // field 3 - share_version
          0x20,
          msg.namespace_version || 0, // field 4 - namespace_version
        ]);

        return blob;
      },
    }),
    decode: (msg) => msg,
    create: (value) => ({
      ...value,
      typeUrl: "/celestia.blob.v1.MsgPayForBlobs",
    }),
  });
  return registry;
};

// Import the Tree class
class Tree {
  constructor(hashFn) {
    this.hashFn = hashFn;
    this.leavesHashes = [];
  }

  push(data) {
    this.leavesHashes.push(this.hashLeaf(data));
  }

  hashLeaf(data) {
    let nData = [];
    nData.push(0);
    nData.push(...data);
    let nId = data.slice(0, 29);
    let hl = [];
    hl.push(...nId);
    hl.push(...nId);
    let h = this.hashFn(nData);
    hl.push(...h);
    return hl;
  }

  hashNode(left, right) {
    let nId = left.slice(0, 29);
    let nData = [];
    nData.push(1);
    nData.push(...left);
    nData.push(...right);
    let hn = [];
    hn.push(...nId);
    hn.push(...nId);
    let h = this.hashFn(nData);
    hn.push(...h);
    return hn;
  }

  getRoot() {
    return this._computeRoot(0, this.leavesHashes.length);
  }

  _computeRoot(start, end) {
    let l = end - start;
    if (l === 0) {
      return this.emptyRoot();
    } else if (l === 1) {
      return this.leavesHashes[0];
    } else {
      let sp = getSplitPoint(l);
      let left = this._computeRoot(start, start + sp);
      let right = this._computeRoot(start + sp, end);
      return this.hashNode(left, right);
    }
  }

  emptyRoot() {
    let root = [];
    for (let i = 0; i < 29; i++) {
      root.push(0);
    }
    for (let i = 0; i < 29; i++) {
      root.push(0);
    }
    for (let i = 0; i < 32; i++) {
      root.push(0);
    }
    return root;
  }
}

const getSplitPoint = (length) => {
  if (length < 1) {
    console.error("Trying to split a tree with size < 1");
    return 0;
  }
  let b = 0;
  for (let i = 1; i < length; i <<= 1) {
    b++;
  }
  let k = 1 << (b - 1);
  if (k === length) {
    k >>= 1;
  }
  return k;
};

// Constants for blob handling
const shareSize = 512;
const subTreeRootThreshold = 64;

const prepareBlob = (signer, namespace, data) => {
  // Convert data to hex
  const jsonData = JSON.stringify(data || {});
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(jsonData);
  const dataHex = Array.from(dataBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Prepare namespace
  namespace = namespace.replace("0x", "").padStart(56, "0");

  const blob = {
    namespace_id: hex2Bytes(namespace),
    version: 0,
    share_version: 0,
    data: hex2Bytes(dataHex),
  };

  const msg = {
    typeUrl: "/celestia.blob.v1.MsgPayForBlobs",
    value: {
      signer: signer,
      namespaces: [new Uint8Array([...blob.namespace_id])],
      blob_sizes: [blob.data.length],
      share_commitments: [createCommitments(blob)],
      share_versions: [blob.share_version],
      data: [new Uint8Array(blob.data)], // Add this line to include the data
    },
  };

  return [msg, blob.data.length];
};

const createCommitments = (blob) => {
  const shares = createShares(blob);
  const stw = subTreeWidth(shares.length, subTreeRootThreshold);
  const treeSizes = merkleMountainRangeSizes(shares.length, stw);

  let leafSets = [];
  let cursor = 0;
  for (let i = 0; i < treeSizes.length; i++) {
    let s = shares.slice(cursor, cursor + treeSizes[i]);
    leafSets.push(sharesToBytes(s));
    cursor += treeSizes[i];
  }

  let subTreeRoots = [];
  for (let i = 0; i < leafSets.length; i++) {
    const tree = new Tree(sha256);
    for (let j = 0; j < leafSets[i].length; j++) {
      let leaf = [blob.version];
      leaf.push(...blob.namespace_id);
      leaf.push(...leafSets[i][j]);
      tree.push(leaf);
    }
    let root = tree.getRoot();
    subTreeRoots.push(root);
  }

  return hashFromByteSlices(subTreeRoots);
};

// Helper functions
const hex2Bytes = (hex) => {
  const arr = [];
  for (let i = 0; i < hex.length; i += 2) {
    arr.push(parseInt(hex.substr(i, 2), 16));
  }
  return arr;
};

const createShares = (blob) => {
  let shares = [];
  let [share, left] = createCompactShare(blob, blob.data, true);
  shares.push(share);

  while (left !== undefined) {
    [share, left] = createCompactShare(blob, left, false);
    shares.push(share);
  }

  return shares;
};

const createCompactShare = (blob, data, isFirstShare) => {
  let shareData = [blob.version];
  shareData.push(...blob.namespace_id);
  shareData.push(infoByte(blob.version, isFirstShare));

  if (isFirstShare) {
    shareData.push(...int32ToBytes(data.length));
  }

  let padding = shareSize - shareData.length;

  if (padding >= data.length) {
    shareData.push(...data);
    for (let i = data.length; i < padding; i++) {
      shareData.push(0);
    }
    return [shareData, undefined];
  }

  shareData.push(...data.slice(0, padding));
  return [shareData, data.slice(padding)];
};

// Additional helper functions
const subTreeWidth = (sharesCount, threshold) => {
  let s = Math.floor(sharesCount / threshold);
  if (sharesCount % threshold !== 0) s++;
  s = roundUpPowerOfTwo(s);
  const minSquareSize = roundUpPowerOfTwo(Math.ceil(Math.sqrt(s)));
  return minSquareSize < s ? minSquareSize : s;
};

const roundUpPowerOfTwo = (s) => {
  let pwr = 1;
  while (pwr < s) pwr <<= 1;
  return pwr;
};

const infoByte = (version, isFirstShare) => {
  const prefix = version << 1;
  return isFirstShare ? prefix + 1 : prefix;
};

const int32ToBytes = (i) => {
  const arr = [0, 0, 0, 0];
  for (let index = arr.length - 1; index > -1; index--) {
    const byte = i & 0xff;
    arr[index] = byte;
    i = i >> 8;
  }
  return arr;
};

const hashFromByteSlices = (slices) => {
  if (slices.length === 0) return new Uint8Array(0);
  if (slices.length === 1) {
    let arr = [0];
    arr.push(...slices[0]);
    return sha256(arr);
  }

  const sp = getSplitPoint(slices.length);
  const left = hashFromByteSlices(slices.slice(0, sp));
  const right = hashFromByteSlices(slices.slice(sp));
  let arr = [1];
  arr.push(...left);
  arr.push(...right);
  return sha256(arr);
};

const CHAIN_ID = "mocha-4";
const RPC_ENDPOINT = "https://rpc.celestia-mocha.com";

// const AddSongForm = ({ onSongAdded }) => {
//   const [url, setUrl] = useState("");
//   const [error, setError] = useState("");
//   const [success, setSuccess] = useState(false);
//   const [isKeplrConnected, setIsKeplrConnected] = useState(false);
//   const [myAddress, setMyAddress] = useState("");
//   const [myBalance, setMyBalance] = useState("0");

//   const connectKeplr = async () => {
//     try {
//       // Check if Keplr is installed
//       if (!window.keplr) {
//         throw new Error("Please install Keplr extension");
//       }

//       // Suggest chain to Keplr
//       await window.keplr.experimentalSuggestChain({
//         chainId: CHAIN_ID,
//         chainName: "Celestia Mocha",
//         rpc: RPC_ENDPOINT,
//         rest: "https://api.celestia-mocha.com",
//         bip44: {
//           coinType: 118,
//         },
//         bech32Config: {
//           bech32PrefixAccAddr: "celestia",
//           bech32PrefixAccPub: "celestiapub",
//           bech32PrefixValAddr: "celestiavaloper",
//           bech32PrefixValPub: "celestiavaloperpub",
//           bech32PrefixConsAddr: "celestiavalcons",
//           bech32PrefixConsPub: "celestiavalconspub",
//         },
//         currencies: [
//           {
//             coinDenom: "TIA",
//             coinMinimalDenom: "utia",
//             coinDecimals: 6,
//             coinGeckoId: "celestia",
//           },
//         ],
//         feeCurrencies: [
//           {
//             coinDenom: "TIA",
//             coinMinimalDenom: "utia",
//             coinDecimals: 6,
//             coinGeckoId: "celestia",
//             gasPriceStep: {
//               low: 0.01,
//               average: 0.02,
//               high: 0.1,
//             },
//           },
//         ],
//         stakeCurrency: {
//           coinDenom: "TIA",
//           coinMinimalDenom: "utia",
//           coinDecimals: 6,
//           coinGeckoId: "celestia",
//         },
//       });

//       // Enable the chain
//       await window.keplr.enable(CHAIN_ID);

//       // Get the offlineSigner and accounts
//       const offlineSigner = window.keplr.getOfflineSigner(CHAIN_ID);
//       const accounts = await offlineSigner.getAccounts();
//       const myAddr = accounts[0].address;

//       // Get the user's balance
//       const client = await StargateClient.connect(RPC_ENDPOINT);
//       const balance = await client.getAllBalances(myAddr);
//       const tiaBalance = balance.find((coin) => coin.denom === "utia");

//       setMyAddress(myAddr);
//       setMyBalance(
//         tiaBalance ? (parseInt(tiaBalance.amount) / 1000000).toString() : "0",
//       );
//       setIsKeplrConnected(true);
//       setError("");
//     } catch (err) {
//       console.error("Error connecting to Keplr:", err);
//       setError(err.message || "Failed to connect to Keplr");
//       setIsKeplrConnected(false);
//     }
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setError("");
//     setSuccess(false);

//     if (!isKeplrConnected) {
//       setError("Please connect Keplr wallet first");
//       return;
//     }

//     try {
//       console.log("Starting submission...");
//       const offlineSigner = window.keplr.getOfflineSigner(CHAIN_ID);

//       // Create registry with our custom message type
//       const registry = getCustomRegistry();
//       console.log("Registry created");

//       // Create signing client with custom registry
//       const signingClient = await SigningStargateClient.connectWithSigner(
//         RPC_ENDPOINT,
//         offlineSigner,
//         { registry },
//       );
//       console.log("Signing client created");

//       // Generate random namespace ID (8 bytes)
//       const namespaceId = new Uint8Array(8);
//       crypto.getRandomValues(namespaceId);
//       const namespaceHex = [...namespaceId]
//         .map((x) => x.toString(16).padStart(2, "0"))
//         .join("");

//       console.log("About to prepare blob...");
//       const [msg, dataLength] = prepareBlob(myAddress, namespaceHex, {
//         AddToQueue: {
//           url: {
//             0: url,
//           },
//         },
//       });
//       console.log("Prepared blob:", msg);

//       console.log("Blob value:", msg.value);
//       console.log("First namespace:", msg.value.namespaces[0]);
//       console.log("Share commitment:", msg.value.share_commitments[0]);

//       // Send transaction
//       console.log("About to broadcast...");
//       const tx = await signingClient.signAndBroadcast(
//         myAddress,
//         [msg],
//         {
//           amount: [{ amount: "1596", denom: "utia" }],
//           gas: "79796",
//         },
//         "Sent via dj celestia",
//       );

//       console.log("Transaction result:", tx);

//       if (tx.code === 0) {
//         setSuccess(true);
//         setUrl("");
//         if (onSongAdded) onSongAdded();
//       } else {
//         throw new Error(`Transaction failed: ${tx.rawLog}`);
//       }
//     } catch (err) {
//       console.error("Transaction error:", err);
//       setError(err instanceof Error ? err.message : "Transaction failed");
//     }
//   };

//   return (
//     <div className="p-6 font-mono border-8 border-black">
//       <h2 className="text-2xl font-bold uppercase mb-6">ADD NEW SONG</h2>

//       {!isKeplrConnected ? (
//         <button
//           onClick={connectKeplr}
//           className="w-full bg-black text-white py-4 text-xl font-bold uppercase mb-6"
//         >
//           CONNECT KEPLR
//         </button>
//       ) : (
//         <div className="mb-6 p-4 border-4 border-black">
//           <p className="uppercase text-sm">CONNECTED WALLET</p>
//           <p className="font-bold truncate">{myAddress}</p>
//           <p className="text-sm uppercase">Balance: {myBalance} TIA</p>
//         </div>
//       )}

//       <form onSubmit={handleSubmit} className="space-y-4">
//         <div>
//           <label className="block text-sm font-bold uppercase mb-2">
//             YOUTUBE URL
//           </label>
//           <input
//             type="text"
//             value={url}
//             onChange={(e) => setUrl(e.target.value)}
//             className="w-full px-4 py-3 border-4 border-black font-mono"
//             placeholder="https://youtube.com/..."
//             required
//           />
//         </div>

//         <button
//           type="submit"
//           disabled={!isKeplrConnected}
//           className={`w-full flex items-center justify-center gap-2 py-4 font-bold uppercase
//             ${
//               isKeplrConnected
//                 ? "bg-black text-white hover:bg-gray-800"
//                 : "bg-gray-300 text-gray-500 cursor-not-allowed"
//             }`}
//         >
//           <Plus size={24} />
//           SUBMIT SONG (1596 uTIA)
//         </button>
//       </form>

//       {error && (
//         <div className="mt-4 p-4 border-4 border-red-500 text-red-500 uppercase font-bold">
//           {error}
//         </div>
//       )}

//       {success && (
//         <div className="mt-4 p-4 border-4 border-green-500 text-green-500 uppercase font-bold">
//           SONG ADDED SUCCESSFULLY
//         </div>
//       )}
//     </div>
//   );
// };
//
const AddSongForm = ({ onSongAdded }) => {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    try {
      const response = await fetch(`http://137.184.211.216:3000/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to add song");
      }

      setSuccess(true);
      setUrl("");
      if (onSongAdded) onSongAdded();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <h2 className="text-2xl font-bold uppercase mb-6">ADD NEW SONG</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-bold uppercase mb-2">
            YOUTUBE URL
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-4 py-3 border-4 border-black font-mono"
            placeholder="https://youtube.com/..."
            required
          />
        </div>
        <button
          type="submit"
          className="w-full bg-black text-white py-4 text-xl font-bold uppercase hover:bg-gray-800 flex items-center justify-center gap-2"
        >
          <Plus size={24} />
          ADD TO QUEUE
        </button>
      </form>
      {error && (
        <div className="mt-4 p-4 border-4 border-red-500 text-red-500 uppercase font-bold">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 p-4 border-4 border-green-500 text-green-500 uppercase font-bold">
          SONG ADDED SUCCESSFULLY
        </div>
      )}
    </>
  );
};

function merkleMountainRangeSizes(totalSize, maxTreeSize) {
  let treeSizes = [];

  while (totalSize > 0) {
    if (totalSize >= maxTreeSize) {
      treeSizes.push(maxTreeSize);
      totalSize -= maxTreeSize;
    } else {
      let size = roundDownPowerOfTwo(totalSize);
      treeSizes.push(size);
      totalSize -= treeSizes;
    }
  }

  return treeSizes;
}
function sharesToBytes(shares) {
  let bytes = [];
  for (let i = 0; i < shares.length; i++) {
    bytes.push(shares[i]);
  }
  return bytes;
}

// Proto definition for encoding/decoding
const proto = {
  MsgPayForBlobs: {
    encode: (message) => {
      // Convert the message to a binary format
      const encoded = new Uint8Array(
        8 + // version fields
          message.signer.length +
          message.namespaces.reduce((acc, ns) => acc + ns.length, 0) +
          message.blobSizes.length * 4 +
          message.shareCommitments.reduce((acc, sc) => acc + sc.length, 0) +
          message.shareVersions.length * 4,
      );

      let offset = 0;

      // Write fields
      // 1. Signer
      const signerBytes = new TextEncoder().encode(message.signer);
      encoded.set(signerBytes, offset);
      offset += signerBytes.length;

      // 2. Namespaces
      message.namespaces.forEach((ns) => {
        encoded.set(ns, offset);
        offset += ns.length;
      });

      // 3. Blob sizes
      const blobSizesView = new DataView(encoded.buffer, offset);
      message.blobSizes.forEach((size, i) => {
        blobSizesView.setUint32(i * 4, size, true);
      });
      offset += message.blobSizes.length * 4;

      // 4. Share commitments
      message.shareCommitments.forEach((sc) => {
        encoded.set(sc, offset);
        offset += sc.length;
      });

      // 5. Share versions
      const shareVersionsView = new DataView(encoded.buffer, offset);
      message.shareVersions.forEach((version, i) => {
        shareVersionsView.setUint32(i * 4, version, true);
      });

      return {
        finish: () => encoded,
      };
    },
    decode: (buffer) => {
      const view = new DataView(buffer.buffer);
      let offset = 0;

      // Read signer
      const signerLength = view.getUint32(offset, true);
      offset += 4;
      const signer = new TextDecoder().decode(
        buffer.slice(offset, offset + signerLength),
      );
      offset += signerLength;

      // Read namespaces
      const namespacesCount = view.getUint32(offset, true);
      offset += 4;
      const namespaces = [];
      for (let i = 0; i < namespacesCount; i++) {
        const nsLength = view.getUint32(offset, true);
        offset += 4;
        namespaces.push(buffer.slice(offset, offset + nsLength));
        offset += nsLength;
      }

      // Read blob sizes
      const blobSizesCount = view.getUint32(offset, true);
      offset += 4;
      const blobSizes = [];
      for (let i = 0; i < blobSizesCount; i++) {
        blobSizes.push(view.getUint32(offset + i * 4, true));
      }
      offset += blobSizesCount * 4;

      // Read share commitments
      const shareCommitmentsCount = view.getUint32(offset, true);
      offset += 4;
      const shareCommitments = [];
      for (let i = 0; i < shareCommitmentsCount; i++) {
        const scLength = view.getUint32(offset, true);
        offset += 4;
        shareCommitments.push(buffer.slice(offset, offset + scLength));
        offset += scLength;
      }

      // Read share versions
      const shareVersionsCount = view.getUint32(offset, true);
      offset += 4;
      const shareVersions = [];
      for (let i = 0; i < shareVersionsCount; i++) {
        shareVersions.push(view.getUint32(offset + i * 4, true));
      }

      return {
        signer,
        namespaces,
        blobSizes,
        shareCommitments,
        shareVersions,
      };
    },
  },
};

export default AddSongForm;
