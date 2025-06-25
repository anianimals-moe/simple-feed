import pkg from "really-relaxed-json";
const {toJson} = pkg;

const splitByNonAlpha = (txt:string) => {
    return txt.split(/[^\p{L}]/u).filter(x => x.length > 0);
}

const splitByNonAlphaNumeric = (txt:string) => {
    return txt.split(/[^\p{L}\p{N}]/u).filter(x => x.length > 0);
}

export const splitIntoHashtags = (txt:string) => {
    return txt.split(/[.,\s。、!！()\[\]{}<>「」『』＜＞?？〝〟"'`]/).filter(x => x.startsWith("#") || x.startsWith("＃")).map(x => {
        let txt = x.slice(1);
        while (txt.endsWith(":")) {
            txt = txt.slice(0, -1);
        }

        return txt;
    });
}

const containsNumbers = (str) => {
    return /\d/.test(str);
}

const multipleIndexOf = (text, term) => {
    let indices:any = [];
    const len = term.length;
    let index=-1, start=0;
    while (start >= 0) {
        index = text.indexOf(term, start);
        if (index >= 0) {
            indices.push([index, index + len - 1]);
            start = index+1;
        } else {
            start = -1;
        }
    }

    return indices;
}

const findTokenKeyword = (kw, splitTxt) => {
    const {w, r} = kw;
    const wGroup = w.split(" ");
    const wCombine = wGroup.join("");

    // Find the indices where it passes, then check all negatives based on index
    let indices:any = [];
    for (let i=0;i<splitTxt.length;i++) {
        const first = splitTxt[i];
        if (first === wCombine) {
            indices.push([i, i]);
        } else if ((i + wGroup.length <= splitTxt.length && wGroup.every((x, j) => x === splitTxt[i + j]))) {
            indices.push([i, i+wGroup.length-1]);
        }
    }

    if (indices.length === 0) {
        return false;
    }

    return !(r && r.some(x => {
        const {p, s} = x;
        const pp = p?.split(" ").reverse() || [];
        const ss = s?.split(" ") || [];
        return indices.some(([a, b]) => {
            return pp.every((y, i) => splitTxt[a-i-1] === y) && ss.every((y, i) => splitTxt[b+i+1] === y);
        });
    }));
}

const findSegmentKeyword = (kw, txt) => {
    const {w, r} = kw;
    const wordIndex = multipleIndexOf(txt, w);
    if (wordIndex.length === 0) {
        return false;
    }
    if (!r) {return true;}

    return !wordIndex.every(([x, y]) =>  r.some(({w, i}) => {
        const substring = txt.slice(x+i[0], y+i[1]+1);
        return substring === w;
    }));
}

const findHashtagKeyword = (kw, splitTxt) => {
    return splitTxt.includes(kw.w)
}

export const findKeywordIn = (texts:string[], _keywords) => {
    for (const text of texts) {
        const kw = findKeyword(text, _keywords);
        if (kw) {
            return kw;
        }
    }
    return false;
}

export const findKeyword = (text, _keywords, tags:string[]=[]) => {
    const lowText = text.toLowerCase();
    if (_keywords["t"].length > 0) {
        const nonAlpha = splitByNonAlpha(lowText);
        const nonAlphaNumeric = splitByNonAlphaNumeric(lowText);

        for (const kw of _keywords["t"]) {
            if (containsNumbers(kw.w) || kw.r?.some(x => containsNumbers(x))) {
                if (findTokenKeyword(kw, nonAlphaNumeric)) {
                    return kw.o;
                }
            } else {
                if (findTokenKeyword(kw, nonAlpha)) {
                    return kw.o;
                }
            }
        }
    }
    if (_keywords["s"].length > 0) {
        for (const kw of _keywords["s"]) {
            if (findSegmentKeyword(kw, lowText)) {
                return kw.o;
            }
        }
    }
    if (_keywords["#"].length > 0) {
        const hashText = splitIntoHashtags(lowText);
        for (const kw of _keywords["#"]) {
            if (findHashtagKeyword(kw, hashText)) {
                return kw.o;
            }
            if (tags.includes(kw.w)) {
                return kw.o;
            }
        }
    }
    return false;
}


export const prepKeywords = (data) => {
    const unEscapeRelaxed = (s) => {
        return s.replaceAll("<^>", "*").replaceAll("<%>","/");
    }

    let block:any = {"#":[], s:[], t:[], empty:true};
    let search:any = {"#":[], s:[], t:[], empty: true};

    data.forEach(x => {
        let o = JSON.parse(toJson(x.t));
        const {t, ...y} = o;
        y.w = unEscapeRelaxed(y.w);
        y.o = x.t;
        if (t === "s") { // Pre-processing for segment
            if (!y.r) {
                y.r = [];
            }
            // prevent combining emojis by adding ZWJ to prefix and suffix reject filter
            y.r.push({p: "\u200d"});
            y.r.push({s: "\u200d"});

            y.r = y.r.map(xx => {
                let {s, p} = xx;
                if (s) {
                    s = unEscapeRelaxed(s);
                }
                if (p) {
                    p = unEscapeRelaxed(p);
                }
                return {
                    w: [p, y.w, s].filter(z => z).join(""),
                    i: [-p?.length || 0, s?.length || 0]
                }
            });
        }

        if (x.a) {
            search[t].push(y);
            search.empty = false;
        } else {
            block[t].push(y);
            block.empty = false;
        }
    });

    return { search, block };
}