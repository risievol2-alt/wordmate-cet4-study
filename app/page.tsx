"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WordEntry = {
  word: string;
  meaning: string;
  category: Exclude<AppCategory, "all">;
};

type Mode = "learn" | "review" | "mistakes";
type AppCategory = "all" | "common" | "word" | "excel" | "powerpoint";
type LibraryMode = "office" | "cet4" | "custom";
type Result = { selected: string; correct: boolean } | null;
type Progress = { review: string[]; mistakes: string[]; attempts: number };

const STORAGE_KEY = "office-companion-progress-v2";
const CUSTOM_VOCABULARY_KEY = "office-companion-custom-vocabulary-v1";
const LIBRARY_PROGRESS_KEY = "wordmate-library-progress-v1";
const SELECTED_LIBRARY_KEY = "wordmate-selected-library-v1";

const LIBRARIES: Array<{
  id: LibraryMode;
  label: string;
  description: string;
}> = [
  { id: "office", label: "Office 词库", description: "974 个内置词" },
  { id: "cet4", label: "四级词库", description: "4,543 个四级词" },
  { id: "custom", label: "自定义词库", description: "只练自己添加的词" },
];

const CATEGORIES: Array<{ id: AppCategory; label: string; short: string }> = [
  { id: "all", label: "全部", short: "ALL" },
  { id: "common", label: "通用", short: "365" },
  { id: "word", label: "Word", short: "W" },
  { id: "excel", label: "Excel", short: "X" },
  { id: "powerpoint", label: "PowerPoint", short: "P" },
];

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function parseVocabulary(source: string): WordEntry[] {
  const entries = source
    .split(/\r?\n/)
    .map((line) => {
      const [word = "", meaning = "", rawCategory = "common"] = line.split("\t");
      const category = rawCategory.trim() as WordEntry["category"];
      const validCategory = CATEGORIES.some(
        (item) => item.id !== "all" && item.id === category,
      );
      return word.trim() && meaning.trim() && validCategory
        ? { word: word.trim(), meaning: meaning.trim(), category }
        : null;
    })
    .filter((entry): entry is WordEntry => Boolean(entry));
  const unique = new Map<string, WordEntry>();
  entries.forEach((entry) => {
    const key = entry.word.toLowerCase();
    const previous = unique.get(key);
    if (!previous) unique.set(key, entry);
    else if (previous.meaning !== entry.meaning) {
      unique.set(key, { ...previous, meaning: `${previous.meaning}；${entry.meaning}` });
    }
  });
  return [...unique.values()];
}

function readProgress(value: Partial<Progress> | null | undefined): Progress {
  return {
    review: Array.isArray(value?.review)
      ? value.review.filter((word) => typeof word === "string") : [],
    mistakes: Array.isArray(value?.mistakes)
      ? value.mistakes.filter((word) => typeof word === "string") : [],
    attempts: Math.max(0, Number(value?.attempts) || 0),
  };
}

function readSaved(key: string, fallback: unknown) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function belongsToCategory(entry: WordEntry, selected: AppCategory) {
  return (
    selected === "all" ||
    entry.category === selected ||
    (selected !== "common" && entry.category === "common")
  );
}

function optionScore(target: WordEntry, candidate: WordEntry) {
  let score = candidate.category === target.category ? 18 : 0;
  const targetHead = target.meaning.slice(0, 2);
  const candidateHead = candidate.meaning.slice(0, 2);
  for (const character of targetHead) {
    if (candidateHead.includes(character)) score += 3;
  }
  score -= Math.abs(target.meaning.length - candidate.meaning.length) * 0.08;
  return score + Math.random() * 5;
}

export default function Home() {
  const [officeVocabulary, setOfficeVocabulary] = useState<WordEntry[]>([]);
  const [cet4Vocabulary, setCet4Vocabulary] = useState<WordEntry[]>([]);
  const [customVocabulary, setCustomVocabulary] = useState<WordEntry[]>([]);
  const [officeLoaded, setOfficeLoaded] = useState(false);
  const [cet4Loaded, setCet4Loaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [customLoaded, setCustomLoaded] = useState(false);
  const [libraryMode, setLibraryMode] = useState<LibraryMode>("office");
  const [mode, setMode] = useState<Mode>("learn");
  const [category, setCategory] = useState<AppCategory>("all");
  const [current, setCurrent] = useState<WordEntry | null>(null);
  const [options, setOptions] = useState<WordEntry[]>([]);
  const [result, setResult] = useState<Result>(null);
  const [progress, setProgress] = useState<Record<LibraryMode, Progress>>({
    office: readProgress(null), cet4: readProgress(null), custom: readProgress(null),
  });
  const { review: reviewWords, mistakes: mistakeWords, attempts } = progress[libraryMode];
  const nextTimerRef = useRef<number | null>(null);
  const [panelOpen, setPanelOpen] = useState<"review" | "mistakes" | null>(
    null,
  );
  const [customPanelOpen, setCustomPanelOpen] = useState(false);
  const [customWord, setCustomWord] = useState("");
  const [customMeaning, setCustomMeaning] = useState("");
  const [customCategory, setCustomCategory] =
    useState<Exclude<AppCategory, "all">>("common");
  const [customError, setCustomError] = useState("");
  const [customBatch, setCustomBatch] = useState("");

  useEffect(() => {
    fetch("/office.tsv")
      .then((response) => {
        if (!response.ok) throw new Error("词库加载失败，请刷新重试。");
        return response.text();
      })
      .then((source) => setOfficeVocabulary(parseVocabulary(source)))
      .catch((error) => setLoadError(error.message))
      .finally(() => setOfficeLoaded(true));
    fetch("/cet4.tsv")
      .then((response) => {
        if (!response.ok) throw new Error("词库加载失败，请刷新重试。");
        return response.text();
      })
      .then((source) => setCet4Vocabulary(parseVocabulary(source)))
      .catch((error) => setLoadError(error.message))
      .finally(() => setCet4Loaded(true));
      const saved = readSaved(LIBRARY_PROGRESS_KEY, {});
      const savedCustom = readSaved(CUSTOM_VOCABULARY_KEY, []);
      queueMicrotask(() => {
        const selected = readSaved(SELECTED_LIBRARY_KEY, "office");
        if (LIBRARIES.some((item) => item.id === selected)) setLibraryMode(selected);
        setProgress({
          office: readProgress(saved?.office ?? readSaved(STORAGE_KEY, {})),
          cet4: readProgress(saved?.cet4 ?? readSaved("cet4-companion-progress-v1", {})),
          custom: readProgress(saved?.custom),
        });
        setCustomVocabulary(
          Array.isArray(savedCustom)
            ? savedCustom.filter(
                (entry): entry is WordEntry =>
                  typeof entry?.word === "string" &&
                  Boolean(entry.word.trim()) &&
                  typeof entry?.meaning === "string" &&
                  Boolean(entry.meaning.trim()) &&
                  CATEGORIES.some(
                    (item) =>
                      item.id !== "all" && item.id === entry?.category,
                  ),
              )
            : [],
        );
        setCustomLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!customLoaded) return;
    localStorage.setItem(SELECTED_LIBRARY_KEY, JSON.stringify(libraryMode));
  }, [customLoaded, libraryMode]);

  useEffect(() => {
    if (!customLoaded) return;
    localStorage.setItem(
      CUSTOM_VOCABULARY_KEY,
      JSON.stringify(customVocabulary),
    );
  }, [customLoaded, customVocabulary]);

  const vocabulary = useMemo(
    () =>
      libraryMode === "office"
        ? officeVocabulary
        : libraryMode === "cet4"
          ? cet4Vocabulary
          : customVocabulary,
    [cet4Vocabulary, customVocabulary, libraryMode, officeVocabulary],
  );

  useEffect(() => {
    if (!customLoaded) return;
    localStorage.setItem(
      LIBRARY_PROGRESS_KEY,
      JSON.stringify(progress),
    );
  }, [customLoaded, progress]);

  const wordMap = useMemo(
    () => new Map(vocabulary.map((entry) => [entry.word, entry])),
    [vocabulary],
  );

  const activeWords = useMemo(
    () => new Set(vocabulary.map((entry) => entry.word)),
    [vocabulary],
  );

  const categoryVocabulary = useMemo(
    () => vocabulary.filter((entry) => belongsToCategory(entry, category)),
    [category, vocabulary],
  );

  const chooseNext = useCallback((excludeWord?: string, strictExclude = false) => {
    const list =
      mode === "review"
        ? reviewWords
            .map((word) => wordMap.get(word))
            .filter(
              (entry): entry is WordEntry =>
                entry !== undefined &&
                activeWords.has(entry.word) &&
                belongsToCategory(entry, category),
            )
        : mode === "mistakes"
          ? mistakeWords
              .map((word) => wordMap.get(word))
              .filter(
              (entry): entry is WordEntry =>
                entry !== undefined &&
                  activeWords.has(entry.word) &&
                  belongsToCategory(entry, category),
              )
          : categoryVocabulary;
    const basePool = list as WordEntry[];
    const filteredPool = excludeWord
      ? basePool.filter((entry) => entry.word !== excludeWord)
      : basePool;
    const pool = filteredPool.length || strictExclude ? filteredPool : basePool;
    if (!pool.length) {
      setCurrent(null);
      setOptions([]);
      setResult(null);
      return;
    }
    const next = pool[Math.floor(Math.random() * pool.length)];
    const distractorPool = new Map(
      [...categoryVocabulary, ...(libraryMode === "custom" ? officeVocabulary : [])]
        .filter((entry) => entry.word !== next.word && entry.meaning !== next.meaning)
        .map((entry) => [entry.meaning, entry]),
    );
    const distractors = [...distractorPool.values()]
      .filter(
        (entry) =>
          entry.word !== next.word && entry.meaning !== next.meaning,
      )
      .map((entry) => ({ entry, score: optionScore(next, entry) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 36);
    const picked = shuffle(distractors)
      .slice(0, 3)
      .map(({ entry }) => entry);
    setCurrent(next);
    setOptions(shuffle([next, ...picked]));
    setResult(null);
  }, [activeWords, officeVocabulary, libraryMode, category, categoryVocabulary, mistakeWords, mode, reviewWords, wordMap]);

  useEffect(() => {
    if (nextTimerRef.current !== null) {
      window.clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }
    const timer = window.setTimeout(() => chooseNext(), 0);
    return () => window.clearTimeout(timer);
    // chooseNext also changes when a saved list changes; advancing is controlled
    // by answer() in that case, so only these mode-defining values belong here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, libraryMode, mode, vocabulary.length, libraryMode === "custom" ? officeVocabulary.length : 0]);

  useEffect(
    () => () => {
      if (nextTimerRef.current !== null) {
        window.clearTimeout(nextTimerRef.current);
      }
    },
    [],
  );

  const answer = useCallback(
    (option: WordEntry) => {
      if (!current || result) return;
      const correct = option.word === current.word;
      setResult({ selected: option.word, correct });
      setProgress((records) => {
        const previous = records[libraryMode];
        return { ...records, [libraryMode]: {
          attempts: previous.attempts + 1,
          review: correct && !previous.review.includes(current.word)
            ? [current.word, ...previous.review] : previous.review,
          mistakes: correct && mode === "mistakes"
            ? previous.mistakes.filter((word) => word !== current.word)
            : !correct && !previous.mistakes.includes(current.word)
              ? [current.word, ...previous.mistakes] : previous.mistakes,
        } };
      });
      if (nextTimerRef.current !== null) {
        window.clearTimeout(nextTimerRef.current);
      }
      nextTimerRef.current = window.setTimeout(
        () => chooseNext(current.word, mode === "mistakes" && correct),
        correct ? 650 : 1050,
      );
    },
    [chooseNext, current, libraryMode, mode, result],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCustomPanelOpen(false);
        setPanelOpen(null);
        return;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement ||
        customPanelOpen
      ) {
        return;
      }
      const optionIndex = Number(event.key) - 1;
      if (optionIndex >= 0 && optionIndex < options.length) {
        answer(options[optionIndex]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answer, customPanelOpen, options]);

  const speak = () => {
    if (!current || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(current.word);
    utterance.lang = "en-US";
    utterance.rate = 0.82;
    speechSynthesis.speak(utterance);
  };

  const switchMode = (nextMode: Mode) => {
    if (nextTimerRef.current !== null) {
      window.clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }
    setMode(nextMode);
    setResult(null);
    setPanelOpen(null);
  };

  const switchCategory = (nextCategory: AppCategory) => {
    if (nextCategory === category) return;
    if (nextTimerRef.current !== null) {
      window.clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }
    setCategory(nextCategory);
    setCurrent(null);
    setOptions([]);
    setResult(null);
    setPanelOpen(null);
  };

  const switchLibrary = (nextLibrary: LibraryMode) => {
    if (nextLibrary === libraryMode) {
      if (nextLibrary === "custom" && !customVocabulary.length) setCustomPanelOpen(true);
      return;
    }
    if (nextTimerRef.current !== null) {
      window.clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }
    setLibraryMode(nextLibrary);
    setCurrent(null);
    setOptions([]);
    setCategory("all");
    setMode("learn");
    setResult(null);
    setPanelOpen(null);
    if (nextLibrary === "custom" && !customVocabulary.length) {
      setCustomPanelOpen(true);
    }
  };

  const skipWord = () => {
    if (!current) return;
    if (nextTimerRef.current !== null) {
      window.clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }
    chooseNext(current.word);
  };

  const openCustomPanel = () => {
    setCustomError("");
    setCustomCategory(category === "all" ? "common" : category);
    setCustomPanelOpen(true);
  };

  const addCustomWord = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const word = customWord.trim();
    const meaning = customMeaning.trim();
    if (!word || !meaning) {
      setCustomError("请填写英文词汇和中文释义。");
      return;
    }
    if (
      customVocabulary.some(
        (entry) => entry.word.toLowerCase() === word.toLowerCase(),
      )
    ) {
      setCustomError("这个词已经在词库中了。");
      return;
    }
    setCustomVocabulary((entries) => [
      { word, meaning, category: customCategory },
      ...entries,
    ]);
    setCustomWord("");
    setCustomMeaning("");
    setCustomError("");
  };

  const deleteCustomWord = (word: string) => {
    setCustomVocabulary((entries) =>
      entries.filter((entry) => entry.word !== word),
    );
    setProgress((records) => ({ ...records, custom: {
      ...records.custom,
      review: records.custom.review.filter((entry) => entry !== word),
      mistakes: records.custom.mistakes.filter((entry) => entry !== word),
    } }));
  };

  const importCustomWords = () => {
    const lines = customBatch.split(/\r?\n/).filter((line) => line.trim());
    const entries = lines.map((line) => {
      const parts = line.split(/\t|\|/).map((part) => part.trim());
      const category = CATEGORIES.some((item) => item.id !== "all" && item.id === parts[2])
        ? parts[2] as WordEntry["category"] : customCategory;
      return { word: parts[0], meaning: parts[1], category };
    });
    if (!entries.length || entries.some((entry) => !entry.word || !entry.meaning)) {
      setCustomError("每行填写：英文词汇 | 中文释义，也支持从 Excel 复制两列。");
      return;
    }
    const known = new Set(customVocabulary.map((entry) => entry.word.toLowerCase()));
    const added = entries.filter((entry) => {
      if (known.has(entry.word.toLowerCase())) return false;
      known.add(entry.word.toLowerCase());
      return true;
    });
    setCustomVocabulary((previous) => [...added, ...previous]);
    setCustomBatch("");
    setCustomError(`已导入 ${added.length} 个词，跳过 ${entries.length - added.length} 个重复词。`);
  };

  const exportCustomWords = () => {
    const source = customVocabulary.map((entry) => `${entry.word}\t${entry.meaning}\t${entry.category}`).join("\n");
    const url = URL.createObjectURL(new Blob([source], { type: "text/tab-separated-values;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "wordmate-custom.tsv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const loading = libraryMode === "office" ? !officeLoaded
    : libraryMode === "cet4" ? !cet4Loaded : !customLoaded || !officeLoaded;
  const libraryLabel = LIBRARIES.find((item) => item.id === libraryMode)?.label;

  const categoryLabel =
    CATEGORIES.find((item) => item.id === current?.category)?.label ?? "Office";

  const activeList =
    panelOpen === "review"
      ? reviewWords
      : panelOpen === "mistakes"
        ? mistakeWords
        : [];
  const visibleActiveList = activeList.filter((word) => {
    const entry = wordMap.get(word);
    return entry
      ? activeWords.has(entry.word) && belongsToCategory(entry, category)
      : false;
  });

  return (
    <main className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => switchMode("learn")}
          aria-label="返回学习"
        >
          <span className="brand-mark">W</span>
          <span>
            <strong>Wordmate</strong>
            <small>OFFICE · CET-4 · 自定义词库</small>
          </span>
        </button>
        <div className="header-progress">
          <span>
            已掌握 <strong>{reviewWords.length}</strong>
          </span>
          <span className="header-divider" />
          <span>
            待纠错 <strong className="warm">{mistakeWords.length}</strong>
          </span>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar" aria-label="学习导航">
          <div className="mode-label">学习模式</div>
          <nav>
            <button
              className={mode === "learn" ? "active" : ""}
              onClick={() => switchMode("learn")}
            >
              <span className="nav-icon">01</span>
              随机学习
            </button>
            <button
              className={mode === "review" ? "active" : ""}
              onClick={() => switchMode("review")}
            >
              <span className="nav-icon">02</span>
              复习列表
              <b>{reviewWords.length}</b>
            </button>
            <button
              className={mode === "mistakes" ? "active" : ""}
              onClick={() => switchMode("mistakes")}
            >
              <span className="nav-icon">03</span>
              纠错练习
              <b>{mistakeWords.length}</b>
            </button>
          </nav>
          <div className="library-note">
            <span>{libraryLabel}</span>
            <strong>{loading ? "—" : vocabulary.length}</strong>
            <small>当前词库 · 独立学习进度</small>
          </div>
        </aside>

        <section className="learning-stage">
          <div className="stage-heading">
            <div>
              <span className="eyebrow">
                {mode === "learn"
                  ? "RANDOM PRACTICE"
                  : mode === "review"
                    ? "REVIEW MODE"
                    : "CORRECTION MODE"}
              </span>
              <h1>
                {mode === "learn"
                  ? libraryMode === "office"
                    ? "把英文界面，练成熟悉操作。"
                    : "今天，再记住一个。"
                  : mode === "review"
                    ? "把记忆再加深一点。"
                    : "把错题变成得分点。"}
              </h1>
            </div>
            <span className="keyboard-hint">按 1–4 快速选择</span>
          </div>

          <div className="library-switch" aria-label="切换词库">
            {LIBRARIES.map((item) => (
              <button key={item.id}
                className={libraryMode === item.id ? "active" : ""}
                aria-pressed={libraryMode === item.id}
                onClick={() => switchLibrary(item.id)}>
                <strong>{item.label}</strong>
                <small>{item.id === "custom" ? `${customVocabulary.length} 个自定义词` : item.description}</small>
              </button>
            ))}
          </div>
          <div className="study-tools">
            <span>{libraryLabel} · {categoryVocabulary.length} 个可练习词</span>
            <button onClick={openCustomPanel}>管理自定义词库</button>
          </div>

          {libraryMode !== "cet4" && <div className="product-filter" aria-label="选择软件词库">
            {CATEGORIES.map((item) => {
              const count =
                item.id === "all"
                  ? vocabulary.length
                  : vocabulary.filter((entry) =>
                      belongsToCategory(entry, item.id),
                    ).length;
              return (
                <button
                  key={item.id}
                  className={category === item.id ? "active" : ""}
                  onClick={() => switchCategory(item.id)}
                >
                  <span>{item.short}</span>
                  <strong>{item.label}</strong>
                  <small>{count}</small>
                </button>
              );
            })}
          </div>}

          <article className="quiz-card">
            {loading || (!current && categoryVocabulary.length > 0 && mode === "learn") ? (
              <div className="empty-state">
                <span className="loader" />
                <h2>正在装载{libraryLabel}</h2>
                <p>马上开始第一题…</p>
              </div>
            ) : !categoryVocabulary.length ? (
              <div className="empty-state">
                <span className="empty-number">＋</span>
                <h2>{libraryMode === "custom" ? "这里还没有自定义词汇" : "词库暂时不可用"}</h2>
                <p>{libraryMode === "custom" ? "添加单词或批量粘贴词汇，建立自己的词库。" : loadError || "请刷新页面后重试。"}</p>
                {libraryMode === "custom" && <button onClick={openCustomPanel}>添加词汇</button>}
              </div>
            ) : !current ? (
              <div className="empty-state">
                <span className="empty-number">✓</span>
                <h2>
                  {mode === "review" ? "复习列表还是空的" : "纠错任务完成"}
                </h2>
                <p>
                  {mode === "review"
                    ? "答对的单词会自动来到这里。"
                    : "答错的单词会自动进入纠错列表。"}
                </p>
                <button onClick={() => switchMode("learn")}>继续随机学习</button>
              </div>
            ) : (
              <>
                <div className="word-area">
                  <span className="question-count">
                    {libraryMode === "office" ? categoryLabel.toUpperCase() : libraryMode === "cet4" ? "CET-4" : "CUSTOM"} · QUESTION{" "}
                    {String(attempts + 1).padStart(2, "0")}
                  </span>
                  <button
                    className={`word-button ${current.word.length > 18 ? "long-term" : ""}`}
                    onClick={speak}
                  >
                    <span>{current.word}</span>
                    <i aria-hidden="true">听</i>
                  </button>
                  <p>选择最准确的中文释义</p>
                </div>
                <div className="options-grid">
                  {options.map((option, index) => {
                    const isCorrect = option.word === current.word;
                    const isSelected = result?.selected === option.word;
                    const stateClass = result
                      ? isCorrect
                        ? "correct"
                        : isSelected
                          ? "wrong"
                          : "muted"
                      : "";
                    return (
                      <button
                        key={`${current.word}-${option.word}`}
                        className={`option ${stateClass}`}
                        onClick={() => answer(option)}
                        disabled={Boolean(result)}
                      >
                        <span>{index + 1}</span>
                        <strong>{option.meaning}</strong>
                        {result && isCorrect && <em>正确</em>}
                        {result && isSelected && !isCorrect && <em>再想想</em>}
                      </button>
                    );
                  })}
                </div>
                <div className="question-footer">
                <div className={`feedback ${result ? "visible" : ""}`} aria-live="polite">
                  {result?.correct
                    ? "回答正确，已加入复习列表"
                    : result
                      ? `正确释义：${current.meaning}`
                      : "点击英文单词可播放发音"}
                </div>
                <button className="skip-word" onClick={skipWord}>换一个词 →</button>
                </div>
              </>
            )}
          </article>

          <div className="quick-lists">
            <button onClick={() => setPanelOpen("review")}>
              <span className="list-swatch review" />
              <span>
                <small>复习列表</small>
                <strong>{reviewWords.length} 个已掌握词</strong>
              </span>
              <i>查看</i>
            </button>
            <button onClick={() => setPanelOpen("mistakes")}>
              <span className="list-swatch mistakes" />
              <span>
                <small>纠错列表</small>
                <strong>{mistakeWords.length} 个待巩固词</strong>
              </span>
              <i>查看</i>
            </button>
          </div>
        </section>
      </section>

      {customPanelOpen && (
        <div className="panel-backdrop" onClick={() => setCustomPanelOpen(false)}>
          <aside className="word-panel custom-panel" role="dialog" aria-modal="true"
            aria-label="管理自定义词库" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div><span>YOUR VOCABULARY</span><h2>自定义词库</h2></div>
              <button onClick={() => setCustomPanelOpen(false)} aria-label="关闭自定义词库">×</button>
            </div>
            <div className="custom-content">
              <p className="custom-note">词汇保存在当前浏览器中。其他访客拥有各自的词库；清除浏览器数据会移除词汇。</p>
              <form className="custom-form" onSubmit={addCustomWord}>
                <label>英文词汇<input value={customWord} onChange={(event) => setCustomWord(event.target.value)} placeholder="例如：teamwork" maxLength={120} required /></label>
                <label>中文释义<input value={customMeaning} onChange={(event) => setCustomMeaning(event.target.value)} placeholder="例如：团队合作" maxLength={200} required /></label>
                <label>分类<select value={customCategory} onChange={(event) => setCustomCategory(event.target.value as WordEntry["category"])}>
                  {CATEGORIES.filter((item) => item.id !== "all").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select></label>
                <button type="submit" className="panel-action">添加词汇</button>
              </form>
              <details className="batch-import">
                <summary>批量添加词汇</summary>
                <label htmlFor="custom-batch">每行“英文 | 中文”，或直接粘贴 Excel 的两列</label>
                <textarea id="custom-batch" value={customBatch} onChange={(event) => setCustomBatch(event.target.value)} placeholder={"teamwork | 团队合作\nmeeting | 会议"} rows={5} />
                <button className="panel-action" onClick={importCustomWords}>导入词汇</button>
              </details>
              {customError && <p className="custom-message" role="status">{customError}</p>}
              <div className="custom-list-toolbar">
                <h3 className="custom-list-heading">我的词汇 · {customVocabulary.length}</h3>
                <button disabled={!customVocabulary.length} onClick={exportCustomWords}>导出词库</button>
              </div>
              <div className="custom-word-list">
                {!customVocabulary.length ? <p className="custom-note">还没有添加词汇。</p> : customVocabulary.map((entry) => (
                  <div key={entry.word}>
                    <span><strong>{entry.word}</strong><small>{entry.meaning} · {CATEGORIES.find((item) => item.id === entry.category)?.label}</small></span>
                    <button onClick={() => deleteCustomWord(entry.word)} aria-label={`删除 ${entry.word}`}>删除</button>
                  </div>
                ))}
              </div>
            </div>
            <button className="panel-action" disabled={!customVocabulary.length} onClick={() => {
              setCustomPanelOpen(false); switchMode("learn"); switchLibrary("custom"); setCategory("all");
            }}>开始学习自定义词库</button>
          </aside>
        </div>
      )}

      {panelOpen && (
        <div className="panel-backdrop" onClick={() => setPanelOpen(null)}>
          <aside
            className="word-panel"
            onClick={(event) => event.stopPropagation()}
            aria-label={panelOpen === "review" ? "复习列表" : "纠错列表"}
          >
            <div className="panel-heading">
              <div>
                <span>
                  {panelOpen === "review" ? "REVIEW LIST" : "MISTAKE LIST"}
                </span>
                <h2>
                  {panelOpen === "review" ? "复习列表" : "纠错列表"}
                </h2>
              </div>
              <button onClick={() => setPanelOpen(null)} aria-label="关闭">
                ×
              </button>
            </div>
            <div className="word-list">
              {!visibleActiveList.length ? (
                <p className="panel-empty">这里还没有单词。</p>
              ) : (
                visibleActiveList.slice(0, 100).map((word, index) => (
                  <div key={word}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{word}</strong>
                    <p>{wordMap.get(word)?.meaning}</p>
                  </div>
                ))
              )}
            </div>
            <button
              className="panel-action"
              onClick={() =>
                switchMode(panelOpen === "review" ? "review" : "mistakes")
              }
              disabled={!visibleActiveList.length}
            >
              开始{panelOpen === "review" ? "复习" : "纠错"}
            </button>
          </aside>
        </div>
      )}
    </main>
  );
}
