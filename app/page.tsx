"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WordEntry = {
  word: string;
  meaning: string;
  category: Exclude<AppCategory, "all">;
};

type Mode = "learn" | "review" | "mistakes";
type AppCategory = "all" | "common" | "word" | "excel" | "powerpoint";
type Result = { selected: string; correct: boolean } | null;

const STORAGE_KEY = "office-companion-progress-v2";

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
  return source
    .split(/\r?\n/)
    .map((line) => {
      const [word = "", meaning = "", rawCategory = ""] = line.split("\t");
      const category = rawCategory.trim() as WordEntry["category"];
      const validCategory = CATEGORIES.some(
        (item) => item.id !== "all" && item.id === category,
      );
      return word.trim() && meaning.trim() && validCategory
        ? { word: word.trim(), meaning: meaning.trim(), category }
        : null;
    })
    .filter((entry): entry is WordEntry => Boolean(entry));
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
  const [vocabulary, setVocabulary] = useState<WordEntry[]>([]);
  const [mode, setMode] = useState<Mode>("learn");
  const [category, setCategory] = useState<AppCategory>("all");
  const [current, setCurrent] = useState<WordEntry | null>(null);
  const [options, setOptions] = useState<WordEntry[]>([]);
  const [result, setResult] = useState<Result>(null);
  const [reviewWords, setReviewWords] = useState<string[]>([]);
  const [mistakeWords, setMistakeWords] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);
  const nextTimerRef = useRef<number | null>(null);
  const [panelOpen, setPanelOpen] = useState<"review" | "mistakes" | null>(
    null,
  );

  useEffect(() => {
    fetch("/office.tsv")
      .then((response) => response.text())
      .then((source) => setVocabulary(parseVocabulary(source)));
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      queueMicrotask(() => {
        setReviewWords(Array.isArray(saved.review) ? saved.review : []);
        setMistakeWords(Array.isArray(saved.mistakes) ? saved.mistakes : []);
        setAttempts(Number(saved.attempts) || 0);
      });
    } catch {
      // Start clean if local data is invalid.
    }
  }, []);

  useEffect(() => {
    if (!vocabulary.length) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        review: reviewWords,
        mistakes: mistakeWords,
        attempts,
      }),
    );
  }, [attempts, mistakeWords, reviewWords, vocabulary.length]);

  const wordMap = useMemo(
    () => new Map(vocabulary.map((entry) => [entry.word, entry])),
    [vocabulary],
  );

  const categoryVocabulary = useMemo(
    () =>
      category === "all"
        ? vocabulary
        : vocabulary.filter((entry) => entry.category === category),
    [category, vocabulary],
  );

  const chooseNext = useCallback((excludeWord?: string, strictExclude = false) => {
    if (!vocabulary.length) return;
    const list =
      mode === "review"
        ? reviewWords
            .map((word) => wordMap.get(word))
            .filter(
              (entry): entry is WordEntry =>
                entry !== undefined &&
                (category === "all" || entry.category === category),
            )
        : mode === "mistakes"
          ? mistakeWords
              .map((word) => wordMap.get(word))
              .filter(
                (entry): entry is WordEntry =>
                  entry !== undefined &&
                  (category === "all" || entry.category === category),
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
      return;
    }
    const next = pool[Math.floor(Math.random() * pool.length)];
    const distractors = categoryVocabulary
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
  }, [category, categoryVocabulary, mistakeWords, mode, reviewWords, vocabulary.length, wordMap]);

  useEffect(() => {
    const timer = window.setTimeout(() => chooseNext(), 0);
    return () => window.clearTimeout(timer);
    // chooseNext also changes when a saved list changes; advancing is controlled
    // by answer() in that case, so only these mode-defining values belong here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, mode, vocabulary.length]);

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
      setAttempts((value) => value + 1);
      if (correct) {
        setReviewWords((words) =>
          words.includes(current.word) ? words : [current.word, ...words],
        );
        if (mode === "mistakes") {
          setMistakeWords((words) =>
            words.filter((word) => word !== current.word),
          );
        }
      } else {
        setMistakeWords((words) =>
          words.includes(current.word) ? words : [current.word, ...words],
        );
      }
      if (nextTimerRef.current !== null) {
        window.clearTimeout(nextTimerRef.current);
      }
      nextTimerRef.current = window.setTimeout(
        () => chooseNext(current.word, mode === "mistakes" && correct),
        correct ? 650 : 1050,
      );
    },
    [chooseNext, current, mode, result],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const optionIndex = Number(event.key) - 1;
      if (optionIndex >= 0 && optionIndex < options.length) {
        answer(options[optionIndex]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answer, options]);

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
    if (nextTimerRef.current !== null) {
      window.clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }
    setCategory(nextCategory);
    setResult(null);
    setPanelOpen(null);
  };

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
    return category === "all" || entry?.category === category;
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
            <small>OFFICE 英文界面陪练</small>
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
            <span>Office 界面词库</span>
            <strong>{vocabulary.length || "—"}</strong>
            <small>WORD · EXCEL · PPT</small>
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
                  ? "把英文界面，练成熟悉操作。"
                  : mode === "review"
                    ? "把记忆再加深一点。"
                    : "把错题变成得分点。"}
              </h1>
            </div>
            <span className="keyboard-hint">按 1–4 快速选择</span>
          </div>

          <div className="product-filter" aria-label="选择软件词库">
            {CATEGORIES.map((item) => {
              const count =
                item.id === "all"
                  ? vocabulary.length
                  : vocabulary.filter((entry) => entry.category === item.id)
                      .length;
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
          </div>

          <article className="quiz-card">
            {!vocabulary.length ? (
              <div className="empty-state">
                <span className="loader" />
                <h2>正在装载 Office 界面词库</h2>
                <p>马上开始第一题…</p>
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
                    {categoryLabel.toUpperCase()} · QUESTION{" "}
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
                <div className={`feedback ${result ? "visible" : ""}`}>
                  {result?.correct
                    ? "回答正确，已加入复习列表"
                    : result
                      ? `正确释义：${current.meaning}`
                      : "点击英文单词可播放发音"}
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
