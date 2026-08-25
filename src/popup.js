// IIFE
(() => {

// Internally we use "favourites" but the default to display is "favorites"
const EXTENSION_NAME = chrome.i18n.getMessage('extensionName') || 'Site Favorites'
const FAVOURITES = chrome.i18n.getMessage('favourites') || 'favorites'

const EXTENSION_NAME_ALT = EXTENSION_NAME === 'Site Favorites' ? 'Site Favourites' : 'Site Favorites'
const EXTENSION_VERSION = '1.1.1' // Can't read the manifest from here

// Settings
const RECENT_DAYS = 30

// Date formats
const formatDM = new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'long'})
const formatDMY = new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'short', year: 'numeric'})

// State
let fullDomain = 'unknown'
let baseDomain = 'unknown'
let currentDomain = 'unknown'
let selectedTab = 'site' // 'site' or 'recent'
let selectedSort = 'name' // 'name' or 'date'

initialise()
return

///// Initialise

async function initialise () {
    const tabs = await chrome.tabs.query({currentWindow: true, active: true})
    if (tabs[0]) {
        fullDomain = new URL(tabs[0].url).hostname
        baseDomain = getBaseDomain(fullDomain)
        if (fullDomain !== baseDomain && fullDomain !== `www.${baseDomain}`) {
            // Pre-select full domain if it has bookmarks, otherwise base
            $('.sf-site-selector').addClass('enabled').on('click', onToggleDomain)
            const fullFavourites = await getDomainBookmarks(fullDomain)
            await setDomain(fullFavourites?.length ? fullDomain : baseDomain)
        } else {
            await setDomain(baseDomain)
        }
    }
    $('.extensionName').text(EXTENSION_NAME)
    $('span.favourites').text(FAVOURITES)
    $('.tab-site').on('click', onShowDomainFavourites)
    $('.tab-recent').on('click', onShowRecentFavourites)
    $('.sf-add').on('click', onAdd)
    $('.sf-favourites').on('click', '.sf-remove', onRemove)
    $('.sf-favourites').on('click', '.sf-link', onLink)
}

///// Event handlers

async function onShowDomainFavourites(event) {
    event.preventDefault()
    await showDomainFavourites()
}
async function onShowRecentFavourites(event) {
    event.preventDefault()
    await showRecentFavourites()
}
async function onToggleDomain(event) {
    event.preventDefault()
    await setDomain(currentDomain === fullDomain ? baseDomain : fullDomain)
}
async function onAdd(event) {
    event.preventDefault()
    const tabs = await chrome.tabs.query({currentWindow: true, active: true})
    await addToFavourites(tabs[0])
}
async function onRemove(event) {
    event.preventDefault()
    await removeFromFavourites($(this).closest('li'))
}
async function onLink(event) {
    event.preventDefault()
    await goToFavourite($(this).closest('li'))
    window.close()
}

///// Domain-specific bookmarks

async function getDomainFolder(domain) {
    const favouritesFolder = await getFavouritesFolder()
    return favouritesFolder && await getChildByTitle(favouritesFolder.id, domain)
}
async function getOrCreateDomainFolder(domain) {
    const domainFolder = await getDomainFolder(domain)
    if (domainFolder) {
        return domainFolder
    }
    else {
        const favouritesFolder = await getOrCreateFavouritesFolder()
        return await addBookmark({
            parentId: favouritesFolder.id,
            title: domain
        })
    }
}
async function getRecentBookmarks(domain) {
    const folder = await getFavouritesFolder()
    const tree = folder && await chrome.bookmarks.getSubTree(folder.id)
    if (!tree?.[0]?.children) return []
    const all = tree[0].children.flatMap(_ => _.children ?? [])
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000
    const recent = all.filter(_ => _.dateAdded > cutoff)
    return recent.sort((a, b) => b.dateAdded - a.dateAdded)
}
async function getDomainBookmarks(domain) {
    const folder = await getDomainFolder(domain)
    return (folder && await chrome.bookmarks.getChildren(folder.id)) ?? []
}
async function saveOrderedBookmark(domain, bookmark) {
    const domainFolder = await getOrCreateDomainFolder(domain)
    const existing = await getChildByUrl(domainFolder.id, bookmark.url)
    if (existing) {
        return chrome.bookmarks.update(existing.id, {
            title: bookmark.title
        })
    }
    else {
        return await addBookmark({
            parentId: domainFolder.id,
            title: bookmark.title,
            url: bookmark.url
        })
    }
}

///// UI stuff

async function showDomainFavourites() {
    if (selectedTab === 'site') return
    $('h1.tab-site').addClass('selected')
    $('h1.tab-recent').removeClass('selected')
    selectedTab = 'site'
    setDomain(currentDomain)
}

async function showRecentFavourites() {
    if (selectedTab === 'recent') return
    $('h1.tab-site').removeClass('selected')
    $('h1.tab-recent').addClass('selected')
    selectedTab = 'recent'
    setRecent()
}

async function setDomain(domain) {
    currentDomain = domain
    $('h1 .sf-site').text(currentDomain)
    const favourites = await getDomainBookmarks(currentDomain)
    if (favourites) {
        favourites.sort(selectedSort === 'name' ?
            (a, b) => a.title.localeCompare(b.title) :
            (a, b) => b.dateAdded - a.dateAdded)
        clearFavouritesMenu()
        for (const favourite of favourites) {
            $('.sf-favourites').append(await createFavouriteItem(favourite))
        }
    }
}

async function setRecent() {
    const favourites = await getRecentBookmarks()
    if (favourites) {
        clearFavouritesMenu()
        for (const favourite of favourites) {
            $('.sf-favourites').append(await createFavouriteItem(favourite, true))
        }
    }
}

async function addToFavourites ({title, url} = {}) {
    if (url) {
        title = title || url
        const bookmark = await saveOrderedBookmark(currentDomain, {title, url})
        addToFavouritesMenu(bookmark)
        // Add, then quickly remove, the "added" class, and let css transitions fade nicely
        const items = $('.sf-favourites li').filter(function () { return $(this).find('a.sf-link').attr('href') === url })
        items.addClass('added')
        setTimeout(() => items.removeClass('added'), 100)
    }
}

function clearFavouritesMenu() {
    $('.sf-favourites').empty()
}

async function createFavouriteItem(favourite, includeDomain) {
    const {title, url, id, dateAdded, parentId} = favourite
    const domain = includeDomain ? (await chrome.bookmarks.get(parentId))[0]?.title : null
    const domainElement = domain ? `<span class="sf-domain">${domain}</span>` : ''
    const dateElement = dateAdded ? `<span class="sf-date" title="${formatAddedDateTooltip(dateAdded)}">${formatAddedDate(dateAdded)}</span>` : ''
    return $(`<li><a href="#" class="sf-remove">&times;</a><a class="sf-link" href="${url}" title="${url}">${title}</a>${domainElement}${dateElement}`)
        .data('id', id).data('dateAdded', dateAdded)
}

async function addToFavouritesMenu(favourite) {
    const {title, url, id, dateAdded} = favourite
    $('.sf-favourites li')
        .filter(function () {return $(this).find('.sf-link').attr('href') === url})
        .remove()
    const newItem = await createFavouriteItem(favourite)

    let comparator
    if (selectedSort === 'name') {
        const titleUpper = title.toUpperCase()
        comparator = (element) => $(element).find('.sf-link').text().toUpperCase() > titleUpper
    }
    else {
        comparator = (element) => $(element).data('dateAdded') > dateAdded
    }
    const nextItem = $('.sf-favourites li').toArray().find(comparator)
    if (nextItem) {
        $(nextItem).before(newItem)
    }
    else {
        $('.sf-favourites').append(newItem)
    }
}

async function removeFromFavourites (listItem) {
    await chrome.bookmarks.remove(listItem.data('id'))
    listItem.addClass('deleted')
        .on('transitionend', () => { listItem.remove() })
}

async function goToFavourite (listItem) {
    const url = listItem.find('.sf-link').attr('href')
    const tabs = await chrome.tabs.query({currentWindow: true, active: true})
    await chrome.scripting.executeScript({
        func: (url) => document.location = url,
        args: [url],
        target: { tabId: tabs[0].id },
    })
}

///// Generic bookmarks

async function getOtherBookmarksFolder() {
    const topLevel = (await chrome.bookmarks.getChildren('0'))
    return topLevel[1]
}
async function getFavouritesFolder() {
    const otherBookmarksFolder = await getOtherBookmarksFolder()
    // If the alternative spelling already exists, just use that
    // (to avoid ending up with both Site Favorites and Site Favourites folders)
    return await getChildByTitles(otherBookmarksFolder.id, [EXTENSION_NAME, EXTENSION_NAME_ALT])
}
async function getOrCreateFavouritesFolder() {
    const favouritesFolder = await getFavouritesFolder()
    return favouritesFolder ?? await chrome.bookmarks.create({title: EXTENSION_NAME})
}
async function getChildByTitle(parentId, title) {
    const children = await chrome.bookmarks.getChildren(parentId)
    return (children.find(_ => _.title === title))
}
async function getChildByTitles(parentId, titles) {
    const children = await chrome.bookmarks.getChildren(parentId)
    return (children.find(_ => titles.includes(_.title)))
}
async function getChildByUrl(parentId, url) {
    const children = await chrome.bookmarks.getChildren(parentId)
    return (children.find(_ => _.url === url))
}
async function addBookmark(bookmark) {
    const children = await chrome.bookmarks.getChildren(bookmark.parentId)
    const titleUpper = bookmark.title.toUpperCase()
    const index = children.findIndex(_ => _.title.toUpperCase() > titleUpper)
    if (index >= 0) {
        bookmark.index = index
    }
    return await chrome.bookmarks.create(bookmark)
}

///// Utilities

// Given a full domain (e.g. yats.solnet.co.nz), return the base (e.g. solnet.co.nz)
function getBaseDomain(fullDomain) {
    let matches
    if (matches = fullDomain.match(/([^.]+\.[^.]{2,4}\.[^.]{2})$/)) {
        return matches[0]
    }
    else if (matches = fullDomain.match(/([^.]+\.[^.]{2,})$/)) {
        return matches[0]
    }
    else {
        return fullDomain
    }
}

// Format a Chrome bookmark dateAdded tooltip
function formatAddedDate(timestamp) {
    const d = new Date(timestamp)
    const now = new Date()
    const fmt = d.getFullYear() === now.getFullYear() ? formatDM : formatDMY
    return fmt.format(d)
}
function formatAddedDateTooltip(timestamp) {
    return new Date(timestamp).toDateString()
}

// End of IIFE
})()
