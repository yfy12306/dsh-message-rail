/**
 * 浏览器侧：右侧消息导航条（纯 DOM，无 slot 注册）。
 * - 右侧垂直居中一段固定长度；消息实在放不下时条区内部滚动
 * - 四态宽度：默认 < 临2 < 临1 < 被选择，随鼠标位置逐级变长，带波纹扩散延迟
 * - 悬停状态保持：鼠标停在导航条上时四态冻结不变，离开导航条区域才回归默认
 * - 自适应间距：条数优先 —— 调整条宽/条高不会改变可见条数
 *   （放不下时先压缩间距，压到最小间距仍放不下才滚动）
 * - 鼠标贴近导航条上/下边缘时，条区自动滚动展示更多条（边缘滚动）
 * - 颜色全部使用主题 CSS 变量（适配 moon-flavor 等主题）
 * - 点击平滑滚动到对应消息并闪烁定位
 */
window.__ModuleLoader__.load({
  id: "dsh-message-rail",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    // ---------- 样式（全部主题变量） ----------
    if (typeof document !== "undefined") {
      var tagId = "dsh-message-rail/style";
      if (document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
        var styleTag = document.createElement("style");
        styleTag.setAttribute("data-plugin-css", tagId);
        styleTag.setAttribute("data-plugin", "dsh-message-rail");
        styleTag.textContent = [
          ".dsh-rail {",
          "  position: fixed; top: 50%; transform: translateY(-50%);",
          "  display: flex; flex-direction: column; align-items: center;",
          "  z-index: 15; padding: 5px 3px;",
          "  border-radius: 999px;",
          "  opacity: 0.65; transition: opacity 240ms ease;",
          "}",
          ".dsh-rail:hover { opacity: 1; }",
          ".dsh-rail-scroll {",
          "  display: flex; flex-direction: column; align-items: center;",
          "  overflow-y: auto; scrollbar-width: none;",
          "  -ms-overflow-style: none; overscroll-behavior: contain;",
          "}",
          ".dsh-rail-scroll::-webkit-scrollbar { display: none; }",
          ".dsh-rail-bar {",
          "  border: none; padding: 0; margin: 0; flex: none; cursor: pointer;",
          "  background: var(--dsw-alias-label-tertiary, rgba(120,120,130,0.8));",
          "  transition: width 160ms cubic-bezier(0.3,0.7,0.3,1), opacity 160ms ease;",
          "}",
          ".dsh-rail-bar.dsh-rail-bar-active {",
          "  background: var(--dsw-alias-label-primary, currentColor);",
          "}",
          ".dsh-rail-tip {",
          "  position: fixed;",
          "  max-width: 300px; padding: 6px 10px; border-radius: 8px;",
          "  background: var(--dsw-alias-tooltip-bg, var(--dsw-alias-bg-layer-2, #2b2b30));",
          "  border: 1px solid var(--dsw-alias-border-l2, rgba(120,120,130,0.35));",
          "  color: var(--dsw-alias-label-primary-inverted, #f0f0f2);",
          "  font-size: 12px; line-height: 1.5;",
          "  pointer-events: none; white-space: normal; word-break: break-word;",
          "  box-shadow: var(--dsw-shadow-lv3, 0 2px 8px rgba(0,0,0,0.12));",
          "  z-index: 16; opacity: 0; transition: opacity 140ms ease;",
          "}",
          ".dsh-rail-tip.dsh-rail-tip-show { opacity: 1; }"
        ].join("\n");
        document.head.appendChild(styleTag);
      }
    }

    function cssEscape(value) {
      if (typeof window.CSS === "object" && window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(String(value));
      }
      return String(value).replace(/[^a-zA-Z0-9_-]/g, function (c) { return "\\" + c; });
    }

    function preview(text, max) {
      var t = String(text || "").replace(/\s+/g, " ").trim();
      return t.length <= max ? t : t.slice(0, max) + "…";
    }

    // ---------- 参数 ----------
    // 四态宽度（px）：默认 < 临2 < 临1 < 被选择，依次变长
    var W_DEFAULT = 18;   // 默认态
    var W_ADJ2 = 22;      // 临2：距被选择条 2 根
    var W_ADJ1 = 26;      // 临1：距被选择条 1 根（相邻）
    var W_ACTIVE = 32;    // 被选择：鼠标所在条
    var OP_DEFAULT = 0.55;
    var OP_ADJ2 = 0.7;
    var OP_ADJ1 = 0.85;
    var OP_ACTIVE = 1;
    var RIPPLE_DELAY = 30;  // 波纹扩散延迟步长（ms/级），向外依次延迟，形成起伏感
    var BAR_H = 4;        // 条高（固定：你说的「长度」，条数多了靠滚动浏览）
    var GAP = 6;          // 条间距（固定）
    var MAX_RAIL_H = 0.30; // 导航条最大高度（视口比例，超过则内部滚动）
    var EDGE_ZONE = 24;   // 边缘自动滚动触发区（px，加大更易触发）
    var EDGE_SPEED = 3;   // 边缘滚动速度（px/帧）

    // ---------- 状态 ----------
    var railEl = null;
    var scrollEl = null;
    var tipEl = null;
    var bars = [];
    var lastKeys = [];      // 上次重建的消息 key 列表（用于跳过无意义重建）
    var mouseY = null;
    var lastWaveY = null;   // 上次四态计算的 Y（静止检测）
    var rafPending = false;
    var edgeScrolling = false;

    function ensureEls() {
      if (railEl && document.body.contains(railEl)) return;
      railEl = document.createElement("div");
      railEl.className = "dsh-rail";
      scrollEl = document.createElement("div");
      scrollEl.className = "dsh-rail-scroll";
      scrollEl.style.gap = GAP + "px";
      railEl.appendChild(scrollEl);
      document.body.appendChild(railEl);

      railEl.addEventListener("wheel", function (ev) {
        if (scrollEl.scrollHeight > scrollEl.clientHeight) {
          scrollEl.scrollTop += ev.deltaY;
          ev.preventDefault();
          ev.stopPropagation();
        }
      }, { passive: false });

      railEl.addEventListener("mousemove", function (ev) {
        mouseY = ev.clientY;
        // 只有 Y 真正变化才重算四态（鼠标静止时完全不动，状态保持）
        if (lastWaveY === null || Math.abs(mouseY - lastWaveY) >= 1) {
          lastWaveY = mouseY;
          scheduleWave();
        }
        updateEdgeScroll();
      });
      railEl.addEventListener("mouseleave", function () {
        // 只有真正离开导航条区域才回归默认
        mouseY = null;
        lastWaveY = null;
        scheduleWave();
        hideTip();
        stopEdgeScroll();
      });
    }

    function removeEls() {
      stopEdgeScroll();
      if (railEl && railEl.parentNode) railEl.parentNode.removeChild(railEl);
      if (tipEl && tipEl.parentNode) tipEl.parentNode.removeChild(tipEl);
      railEl = null; scrollEl = null; tipEl = null;
      bars = []; lastKeys = []; mouseY = null; lastWaveY = null;
    }

    function positionRail() {
      if (!railEl) return;
      var scroller = document.querySelector("[data-conversation-scroll]");
      if (!scroller) { railEl.style.right = "10px"; return; }
      var rect = scroller.getBoundingClientRect();
      railEl.style.right = Math.max(6, window.innerWidth - rect.right + 6) + "px";
    }

    function showTip(idx) {
      if (idx < 0 || idx >= bars.length) { hideTip(); return; }
      if (!tipEl) {
        tipEl = document.createElement("div");
        tipEl.className = "dsh-rail-tip";
        document.body.appendChild(tipEl);
      }
      var bar = bars[idx].el;
      var rect = bar.getBoundingClientRect();
      tipEl.textContent = preview(bars[idx].text, 110);
      // 基于 rail 实际位置贴左，条变长也不会与气泡重叠
      var railRect = railEl.getBoundingClientRect();
      tipEl.style.right = (window.innerWidth - railRect.left + 10) + "px";
      // 左上方浮出：气泡底边贴在条的上方；顶部放不下则改放条的下方
      var top = rect.top - 6 - tipEl.offsetHeight;
      if (top < 8) top = rect.bottom + 6;
      tipEl.style.top = top + "px";
      tipEl.classList.add("dsh-rail-tip-show");
    }

    function hideTip() {
      if (tipEl) tipEl.classList.remove("dsh-rail-tip-show");
    }

    // ---------- 四态（离散宽度 + 波纹延迟） ----------
    function applyWave() {
      rafPending = false;
      if (!bars.length) return;

      if (mouseY === null) {
        for (var i = 0; i < bars.length; i++) {
          var el0 = bars[i].el;
          el0.style.transitionDelay = "0ms";
          el0.style.width = W_DEFAULT + "px";
          el0.style.opacity = String(OP_DEFAULT);
          el0.classList.remove("dsh-rail-bar-active");
        }
        return;
      }

      // 找鼠标所在（最近）的条 = 被选择
      var nearest = -1;
      var nearestDist = Infinity;
      for (var j = 0; j < bars.length; j++) {
        var r = bars[j].el.getBoundingClientRect();
        var d = Math.abs(mouseY - (r.top + r.height / 2));
        if (d < nearestDist) { nearestDist = d; nearest = j; }
      }

      for (var k = 0; k < bars.length; k++) {
        var el = bars[k].el;
        var di = Math.abs(k - nearest);
        var w, op, delay;
        if (di === 0) { w = W_ACTIVE; op = OP_ACTIVE; delay = 0; }
        else if (di === 1) { w = W_ADJ1; op = OP_ADJ1; delay = RIPPLE_DELAY; }
        else if (di === 2) { w = W_ADJ2; op = OP_ADJ2; delay = RIPPLE_DELAY * 2; }
        else { w = W_DEFAULT; op = OP_DEFAULT; delay = 0; }
        el.style.transitionDelay = delay + "ms";
        el.style.width = w + "px";
        el.style.opacity = String(op);
        el.classList.toggle("dsh-rail-bar-active", di === 0);
      }
      showTip(nearest);
    }

    function scheduleWave() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(applyWave);
    }

    // ---------- 边缘自动滚动 ----------
    function edgeTick() {
      if (!edgeScrolling || !scrollEl) return;
      var sRect = scrollEl.getBoundingClientRect();
      var sH = sRect.height;
      var rel = mouseY - sRect.top;               // 鼠标相对滚动区的 Y
      var dir = 0;
      if (rel < EDGE_ZONE) dir = -1;              // 贴上边缘 → 向上滚
      else if (rel > sH - EDGE_ZONE) dir = 1;     // 贴下边缘 → 向下滚
      var maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (dir !== 0 && maxScroll > 0) {
        var before = scrollEl.scrollTop;
        var target = before + dir * EDGE_SPEED;
        if (target < 0) target = 0;
        if (target > maxScroll) target = maxScroll;
        scrollEl.scrollTop = target;
        if (scrollEl.scrollTop !== before) {
          scheduleWave();                          // 四态跟随滚动重算
          requestAnimationFrame(edgeTick);         // 循环，直到离开边缘/滚到头
          return;
        }
      }
      edgeScrolling = false;
    }

    function updateEdgeScroll() {
      if (!scrollEl) return;
      var sRect = scrollEl.getBoundingClientRect();
      var sH = sRect.height;
      var overflow = scrollEl.scrollHeight > scrollEl.clientHeight + 1;
      var rel = mouseY - sRect.top;
      var inEdge = rel < EDGE_ZONE || rel > sH - EDGE_ZONE;
      if (!overflow) return;
      if (inEdge) {
        if (!edgeScrolling) {
          edgeScrolling = true;
          requestAnimationFrame(edgeTick);
        }
      } else {
        edgeScrolling = false;
      }
    }

    function stopEdgeScroll() {
      edgeScrolling = false;
    }

    // ---------- 跳转 ----------
    function findScrollParent(el) {
      var node = el;
      while (node && node !== document.body) {
        var style = window.getComputedStyle(node);
        if (style.overflowY === "auto" || style.overflowY === "scroll") return node;
        node = node.parentElement;
      }
      return null;
    }

    function jumpTo(key) {
      var scroller = document.querySelector("[data-conversation-scroll]");
      if (!scroller) return;
      var row = scroller.querySelector('[data-chat-anchor-key="' + cssEscape(key) + '"]');
      if (!row) return;
      // 找真正的滚动元素（scrollBody 或其内层 overflow 容器）
      var scrollParent = findScrollParent(row) || scroller;
      // row 相对滚动容器的绝对位置
      var rowRect = row.getBoundingClientRect();
      var spRect = scrollParent.getBoundingClientRect();
      var target = scrollParent.scrollTop + (rowRect.top - spRect.top) - 12;
      scrollParent.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
      row.style.transition = "background 220ms ease";
      row.style.background = "color-mix(in srgb, var(--dsw-alias-brand-primary, #4c81fa) 18%, transparent)";
      setTimeout(function () {
        row.style.background = "";
        row.style.transition = "";
      }, 850);
    }

    // ---------- 收集用户消息行 ----------
    function collectUserRows() {
      var scroller = document.querySelector("[data-conversation-scroll]");
      if (!scroller) return [];
      // 只取用户消息行（class 含 userRow）：一次用户发言 = 一根导航条。
      // agent 回复、工具调用、追问环节等全部归入该次用户发言，不单独成条。
      var rows = scroller.querySelectorAll("[data-chat-anchor-key]");
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var isUser = false;
        // 行本身或其子元素带 userRow class（用户消息行的特征类名）
        for (var c = 0; c < row.classList.length; c++) {
          if (row.classList[c].indexOf("userRow") !== -1) { isUser = true; break; }
        }
        if (!isUser && row.querySelector('[class*="userRow"]')) isUser = true;
        if (!isUser) continue;
        var text = (row.innerText || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        out.push({ key: row.getAttribute("data-chat-anchor-key"), text: text });
      }
      return out;
    }

    function sameKeys(msgs) {
      if (msgs.length !== lastKeys.length) return false;
      for (var i = 0; i < msgs.length; i++) {
        if (msgs[i].key !== lastKeys[i]) return false;
      }
      return true;
    }

    // ---------- 自动补全历史（dsh 分页加载：默认只渲染最近若干条） ----------
    var AUTO_LOAD_ALL = true;  // 自动点「加载更早」直到历史完整，导航条才覆盖全部对话
    var autoLoading = false;

    function findLoadOlderBtn() {
      var column = document.querySelector("[data-chat-flow]");
      if (!column) return null;
      var older = column.querySelector('[class*="older"]');
      if (!older) return null;
      return older.querySelector("button");
    }

    function maybeAutoLoad() {
      if (!AUTO_LOAD_ALL || autoLoading) return;
      var btn = findLoadOlderBtn();
      if (!btn) return;                                        // 没有「加载更早」= 历史已完整
      autoLoading = true;
      var guard = 0;
      (function step() {
        if (++guard > 400) { autoLoading = false; return; }    // 安全上限，防死循环
        var b = findLoadOlderBtn();
        if (!b) { autoLoading = false; rebuild(); return; }    // 加载完 → 重建导航条
        if (b.disabled) { setTimeout(step, 120); return; }     // 正在加载，等待
        b.click();
        setTimeout(step, 120);
      })();
    }

    function rebuild() {
      var msgs = collectUserRows();
      maybeAutoLoad();
      if (msgs.length < 2) { removeEls(); return; }

      // 消息集合没变（流式输出、局部 UI 抖动、导航条自身变动等）：
      // 只同步文案，不动 DOM —— 悬停中的四态完全不受影响，
      // 这是「鼠标停在导航条上不会缩回默认」的关键。
      if (railEl && document.body.contains(railEl) && sameKeys(msgs)) {
        for (var s = 0; s < msgs.length; s++) {
          bars[s].text = msgs[s].text;
          bars[s].el.setAttribute("aria-label", preview(msgs[s].text, 60));
        }
        positionRail();
        return;
      }

      ensureEls();
      lastKeys = [];
      for (var m = 0; m < msgs.length; m++) lastKeys.push(msgs[m].key);

      scrollEl.innerHTML = "";
      bars = [];
      // 注意：不要清 mouseY —— 鼠标可能正停在导航条上

      var maxH = Math.round(window.innerHeight * MAX_RAIL_H);
      scrollEl.style.maxHeight = maxH + "px";
      scrollEl.style.gap = GAP + "px";

      for (var i = 0; i < msgs.length; i++) {
        (function (msg) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "dsh-rail-bar";
          btn.setAttribute("aria-label", preview(msg.text, 60));
          btn.style.width = W_DEFAULT + "px";
          btn.style.height = BAR_H + "px";
          btn.style.borderRadius = "999px";
          btn.style.opacity = String(OP_DEFAULT);
          btn.addEventListener("click", function () { jumpTo(msg.key); });
          scrollEl.appendChild(btn);
          bars.push({ key: msg.key, text: msg.text, el: btn });
        })(msgs[i]);
      }
      positionRail();
      // 鼠标正悬停在导航条上 → 立即按当前位置恢复四态（不等下一次 mousemove）
      if (mouseY !== null) {
        lastWaveY = null;
        scheduleWave();
      }
    }

    // ---------- 观察器 ----------
    var mo = null;
    var rebuildTimer = null;

    function scheduleRebuild() {
      if (rebuildTimer) clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(rebuild, 250);
    }

    function start() {
      if (mo) return;
      mo = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].type !== "childList") continue;
          var t = mutations[i].target;
          // 忽略导航条/气泡自身的 DOM 变动，避免自我触发的重建循环
          if (railEl && railEl.contains(t)) continue;
          if (tipEl && tipEl.contains(t)) continue;
          scheduleRebuild();
          return;
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
      window.addEventListener("resize", function () {
        positionRail();
        if (scrollEl && bars.length) {
          var maxH = Math.round(window.innerHeight * MAX_RAIL_H);
          scrollEl.style.maxHeight = maxH + "px";
          scrollEl.style.gap = GAP + "px";
        }
      });
      rebuild();
    }

    var inject = [];
    function apply() { start(); }
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
