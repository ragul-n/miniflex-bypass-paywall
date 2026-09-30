/* Split-pane reader layout: article list on the left, article on the right.
 * Articles are loaded into the right pane without a full page reload, keeping
 * the list (and all of its gestures) stable while reading.
 */

const SPLIT_BREAKPOINT = 1100; // Must match the @media query in common.css.
let splitPaneOriginalTitle = "";
let splitPaneRequestIndex = 0;

function splitPaneDocumentTitle() {
    return document.title;
}

function displayLayoutPreference() {
    const body = document.body;
    if (body && body.dataset.displayLayout) {
        return body.dataset.displayLayout;
    }
    return "auto";
}

function isWideViewport() {
    if (window.matchMedia) {
        return window.matchMedia(`(min-width: ${SPLIT_BREAKPOINT}px)`).matches;
    }
    return document.documentElement.clientWidth >= SPLIT_BREAKPOINT;
}

function splitPaneActive() {
    return document.body.classList.contains("split-pane");
}

function splitPaneShouldBeActive() {
    const preference = displayLayoutPreference();
    if (preference === "wide") {
        return true;
    }
    if (preference === "narrow") {
        return false;
    }
    return isWideViewport();
}

function hasItemsList() {
    return document.querySelector(".items") !== null;
}

function splitPaneStorageKey() {
    return "split-pane:" + window.location.pathname;
}

function rememberOpenEntry(url) {
    try {
        sessionStorage.setItem(splitPaneStorageKey(), url);
    } catch (e) {
        // Ignore storage errors (private browsing).
    }
}

function getRememberedEntry() {
    try {
        return sessionStorage.getItem(splitPaneStorageKey());
    } catch (e) {
        return null;
    }
}

function getEntryPane() {
    return document.getElementById("entry-pane");
}

function getSplitList() {
    return document.querySelector("#main .split-list");
}

function splitPanePlaceholderText() {
    const body = document.body;
    if (body && body.dataset.splitPanePlaceholder) {
        return body.dataset.splitPanePlaceholder;
    }
    return "Select an article to read.";
}

function showPanePlaceholder() {
    const pane = getEntryPane();
    if (!pane) {
        return;
    }

    const placeholder = document.createElement("div");
    placeholder.className = "entry-pane-empty";
    placeholder.textContent = splitPanePlaceholderText();

    pane.replaceChildren(placeholder);
    document.title = splitPaneOriginalTitle;
}

function ensureSplitStructure() {
    const main = document.getElementById("main");
    if (!main) {
        return false;
    }
    if (getSplitList() !== null) {
        return true;
    }

    const splitList = document.createElement("div");
    splitList.className = "split-list";
    while (main.firstChild) {
        splitList.appendChild(main.firstChild);
    }
    main.appendChild(splitList);

    // The unread section hides its page header (title + actions) in the
    // two-pane layout. Hidden in JS so it cannot be overridden by user CSS.
    if (document.body.dataset.page === "unread") {
        const listHeader = splitList.querySelector(".page-header");
        if (listHeader) {
            listHeader.style.display = "none";
        }
    }

    const pane = document.createElement("div");
    pane.className = "entry-pane";
    pane.id = "entry-pane";
    pane.setAttribute("role", "region");
    pane.setAttribute("aria-label", "article");
    pane.setAttribute("data-loading-label", "Loading…");
    main.appendChild(pane);

    showPanePlaceholder();
    return true;
}

function removeSplitStructure() {
    const main = document.getElementById("main");
    if (!main) {
        return;
    }

    const splitList = getSplitList();
    if (splitList) {
        const listHeader = splitList.querySelector(".page-header");
        if (listHeader) {
            listHeader.style.display = "";
        }
        while (splitList.firstChild) {
            main.insertBefore(splitList.firstChild, splitList);
        }
        splitList.remove();
    }

    const pane = getEntryPane();
    if (pane) {
        pane.remove();
    }
}

function setCurrentPaneItem(url) {
    const target = new URL(url, window.location.origin);
    let matched = null;

    document.querySelectorAll(".items .item").forEach((item) => {
        const link = item.querySelector(".item-title a");
        if (link && new URL(link.href, window.location.origin).href === target.href) {
            matched = item;
        } else {
            item.classList.remove("current-item");
        }
    });

    if (!matched) {
        return;
    }

    matched.classList.add("current-item");

    const splitList = getSplitList();
    if (splitList) {
        const listTop = splitList.getBoundingClientRect().top;
        const itemTop = matched.getBoundingClientRect().top - listTop;
        const itemBottom = itemTop + matched.offsetHeight;
        if (itemTop < splitList.scrollTop || itemBottom > splitList.scrollTop + splitList.clientHeight) {
            splitList.scrollTo({
                top: splitList.scrollTop + itemTop - splitList.clientHeight / 2,
                behavior: "smooth",
            });
        }
    }
}

function markPaneEntryReadState() {
    const pane = getEntryPane();
    if (!pane) {
        return;
    }

    const toggle = pane.querySelector(":is(a, button)[data-toggle-status]");
    if (!toggle) {
        return;
    }

    const isRead = toggle.dataset.value === "read";
    const currentItem = document.querySelector(".current-item");
    if (!currentItem) {
        return;
    }

    const wasUnread = currentItem.classList.contains("item-status-unread");
    if (isRead) {
        currentItem.classList.remove("item-status-unread");
        currentItem.classList.add("item-status-read");
        if (wasUnread) {
            decrementUnreadCounter(1);
        }
    } else {
        currentItem.classList.remove("item-status-read");
        currentItem.classList.add("item-status-unread");
    }
}

async function openEntryInPane(url, options = {}) {
    if (!splitPaneActive()) {
        window.location.href = url;
        return;
    }

    const pane = getEntryPane();
    if (!pane) {
        return;
    }

    const requestIndex = ++splitPaneRequestIndex;
    const fetchUrl = url + (url.indexOf("?") >= 0 ? "&" : "?") + "partial=1";

    pane.classList.add("entry-pane-loading");
    const loadingLabel = pane.getAttribute("data-loading-label") || "";
    pane.replaceChildren();
    if (loadingLabel) {
        const loadingElement = document.createElement("div");
        loadingElement.className = "entry-pane-empty";
        loadingElement.textContent = loadingLabel;
        pane.appendChild(loadingElement);
    }

    let html;
    try {
        const response = await fetch(fetchUrl, { headers: { "Accept": "text/html" } });
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        html = await response.text();
    } catch (error) {
        console.error("Unable to load entry in the split pane:", error);
        if (requestIndex !== splitPaneRequestIndex) {
            return;
        }
        const currentPane = getEntryPane();
        if (currentPane) {
            currentPane.classList.remove("entry-pane-loading");
            showPanePlaceholder();
        }
        if (options.pushState !== false) {
            window.location.href = url;
        }
        return;
    }

    // A newer request or a split-pane teardown may have happened while we waited.
    const currentPane = getEntryPane();
    if (currentPane === null || requestIndex !== splitPaneRequestIndex || !splitPaneActive()) {
        return;
    }

    currentPane.innerHTML = ttpolicy.createHTML(html);
    currentPane.classList.remove("entry-pane-loading");
    currentPane.scrollTop = 0;

    wirePage(currentPane);
    new TouchHandler().bind(currentPane);

    setCurrentPaneItem(url);
    markPaneEntryReadState();

    if (options.pushState !== false) {
        history.pushState({ splitPaneEntry: url }, "", url);
    }
    rememberOpenEntry(url);

    const entryTitle = currentPane.querySelector(".entry-header h1");
    if (entryTitle) {
        document.title = entryTitle.textContent.trim();
    }
}

function handleSplitPaneItemClick(event) {
    if (!splitPaneActive()) {
        return;
    }
    event.preventDefault();
    openEntryInPane(event.currentTarget.getAttribute("href"), { pushState: true });
}

function handleSplitPanePageLinkClick(event) {
    event.preventDefault();
    goToPage(event.currentTarget.dataset.page);
}

function updateSplitPane() {
    const shouldBeActive = splitPaneShouldBeActive() && hasItemsList();
    const isActive = splitPaneActive();

    if (shouldBeActive === isActive) {
        return;
    }

    if (shouldBeActive) {
        document.body.classList.add("split-pane");
        ensureSplitStructure();

        const rememberedEntry = getRememberedEntry();
        if (rememberedEntry) {
            openEntryInPane(rememberedEntry, { pushState: false });
        }
    } else {
        document.body.classList.remove("split-pane");
        removeSplitStructure();
        document.title = splitPaneOriginalTitle;
    }
}

function initSplitPane() {
    if (!hasItemsList()) {
        return;
    }

    splitPaneOriginalTitle = splitPaneDocumentTitle();

    updateSplitPane();

    window.addEventListener("resize", () => updateSplitPane(), { passive: true });
    window.addEventListener("orientationchange", () => updateSplitPane());

    window.addEventListener("popstate", (event) => {
        if (splitPaneActive() && hasItemsList()) {
            const state = event.state;
            if (state && state.splitPaneEntry) {
                openEntryInPane(state.splitPaneEntry, { pushState: false });
            } else {
                showPanePlaceholder();
                setCurrentPaneItem(null);
            }
        }
    });
}