// IIFE
(() => {

// Internally we use "favourites" but the default to display is "favorites"
const FAVXRITES = chrome.i18n.getMessage('favourites') || 'favorites'
const FAVXRITES_CAP = chrome.i18n.getMessage('favouritesCap') || 'Favorites'

const EXTENSION_NAME = `Site ${FAVXRITES_CAP}`
const EXTENSION_NAME_ALT = `Site ${FAVXRITES_CAP === 'Favorites' ? 'Favourites' : 'Favorites'}`
const EXTENSION_VERSION = '1.0' // Can't read the manifest from here

let fullDomain = 'unknown'
let baseDomain = 'unknown'
let currentDomain = 'unknown'

const bookmarker = {
    getChildren: (id) =>
        new Promise((resolve, reject) =>
                chrome.bookmarks.getChildren(id, resolve)
            ),
    getChildByTitle: (parentId, title) =>
        new Promise((resolve, reject) =>
                chrome.bookmarks.getChildren(parentId, (children) =>
                    resolve(children.find((child) => child.title === title)))
            ),
    getChildByTitles: (parentId, titles) =>
        new Promise((resolve, reject) =>
                chrome.bookmarks.getChildren(parentId, (children) =>
                    resolve(children.find((child) => titles.includes(child.title))))
            ),
    getChildByUrl: (parentId, url) =>
        new Promise((resolve, reject) =>
                chrome.bookmarks.getChildren(parentId, (children) =>
                    resolve(children.find((child) => child.url === url)))
            ),
    search: (query) =>
        new Promise((resolve, reject) =>
                chrome.bookmarks.search(query, resolve)
            ),
    create: (bookmark) =>
        new Promise((resolve, reject) =>
                chrome.bookmarks.create(bookmark, resolve)
            ),
    update: (id, changes) =>
        new Promise((resolve, reject) =>
                chrome.bookmarks.update(id, changes, resolve)
            ),
    remove: (id) =>
        new Promise((resolve, reject) =>
                chrome.bookmarks.remove(id, resolve)
            )
}

const getOtherBookmarksFolder = () => bookmarker.getChildren('0')
    .then((topLevel) => topLevel[1])

const getExtFolder = () => getOtherBookmarksFolder()
    .then((otherBookmarksFolder) => bookmarker.getChildByTitles(otherBookmarksFolder.id, [EXTENSION_NAME, EXTENSION_NAME_ALT]))

const getDmnFolder = (domain) => getExtFolder()
    .then((extFolder) => extFolder && bookmarker.getChildByTitle(extFolder.id, domain))

const getDmnBookmarks = (domain) => getDmnFolder(domain)
    .then((folder) => folder && bookmarker.getChildren(folder.id))

const getOrCreateExtFolder = (domain) => getExtFolder()
    .then((extFolder) =>
        extFolder || bookmarker.create({title: EXTENSION_NAME})
    )

const getOrCreateDmnFolder = (domain) => getDmnFolder(domain)
    .then((dmnFolder) => {
        if (dmnFolder) {
            return dmnFolder
        }
        else {
            return getOrCreateExtFolder().then((extFolder) => {
                return bookmarker.getChildren(extFolder.id)
                .then((children) => {
                    const newBookmark = {
                        parentId: extFolder.id,
                        title: domain
                    }
                    const titleUpper = newBookmark.title.toUpperCase()
                    const newIndex = children.findIndex((child) => child.title.toUpperCase() > titleUpper)
                    if (newIndex >= 0) {
                        newBookmark.index = newIndex
                    }
                    return bookmarker.create(newBookmark)
                })
            })
        }
    })

const saveBookmark = (domain, bookmark) =>
    getOrCreateDmnFolder(domain)
    .then((dmnFolder) =>
        bookmarker.getChildByUrl(dmnFolder.id, bookmark.url)
        .then((existing) => {
            if (existing) {
                return bookmarker.update(existing.id, {
                   title: bookmark.title
               })
            }
            else {
                return bookmarker.create({
                   parentId: dmnFolder.id,
                   title: bookmark.title,
                   url: bookmark.url
               })
            }
        })
    )

const saveOrderedBookmark = (domain, bookmark) =>
    getOrCreateDmnFolder(domain)
    .then((dmnFolder) =>
        bookmarker.getChildByUrl(dmnFolder.id, bookmark.url)
        .then((existing) => {
            if (existing) {
                return bookmarker.update(existing.id, {
                   title: bookmark.title
               })
            }
            else {
                return bookmarker.getChildren(dmnFolder.id)
                .then((children) => {
                    const newBookmark = {
                       parentId: dmnFolder.id,
                       title: bookmark.title,
                       url: bookmark.url
                    }
                    const titleUpper = newBookmark.title.toUpperCase()
                    const newIndex = children.findIndex((child) => child.title.toUpperCase() > titleUpper)
                    if (newIndex >= 0) {
                        newBookmark.index = newIndex
                    }
                    return bookmarker.create(newBookmark)
                })
            }
        })
    )

initialise()
return

function initialise () {
    chrome.tabs.query({currentWindow: true, active: true}, tabs => {
        if (tabs[0]) {
            fullDomain = new URL(tabs[0].url).hostname
            baseDomain = getBaseDomain(fullDomain)
            if (fullDomain !== baseDomain) {
                // Pre-select full domain if it has bookmarks, otherwise base
                $('.sf-site-selector').addClass('enabled').on('click', onToggleDomain)
                getDmnBookmarks(fullDomain).then(fullFavourites => {
                    setDomain(fullFavourites?.length ? fullDomain : baseDomain)
                })
            } else {
                setDomain(baseDomain)
            }
        }
        $('span.favourites').text(FAVXRITES)
        $('span.favouritesCap').text(FAVXRITES_CAP)
        $('.sf-add').on('click', onAdd)
        $('.sf-favourites').on('click', '.sf-remove', onRemove)
        $('.sf-favourites').on('click', '.sf-link', onLink)
    })
}

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

function onToggleDomain(event) {
    event.preventDefault()
    setDomain(currentDomain === fullDomain ? baseDomain : fullDomain)
}

function setDomain(domain) {
    currentDomain = domain
    $('h1 .sf-site').text(currentDomain)
    getDmnBookmarks(currentDomain).then(favourites => {
        clearFavouritesMenu()
        favourites && favourites.forEach(addToFavouritesMenu)
    })
}

function onAdd(event) {
    event.preventDefault()
    chrome.tabs.query({currentWindow: true, active: true}, tabs => {
        addToFavourites(tabs[0])
    })
}

function onRemove(event) {
    event.preventDefault()
    removeFromFavourites($(this).closest('li'))
}

function onLink(event) {
    event.preventDefault()
    goToFavourite($(this).closest('li'))
    window.close()
}

function addToFavourites ({title, url} = {}) {
    if (url) {
        title = title || url
        saveOrderedBookmark(currentDomain, {title, url}).then((bookmark) => {
            addToFavouritesMenu(bookmark)
            // Add, then quickly remove, the "added" class, and let css transitions fade nicely
            const items = $('.sf-favourites li').filter(function () { return $(this).find('a.sf-link').attr('href') === url })
            items.addClass('added')
            setTimeout(() => items.removeClass('added'), 100)
        })
    }
}

function clearFavouritesMenu() {
    $('.sf-favourites').empty()
}

function addToFavouritesMenu({title, url, id}) {
    $('.sf-favourites li')
        .filter(function () {return $(this).find('.sf-link').attr('href') === url})
        .remove()
    const newItem = $(`<li><a href="#" class="sf-remove">&times;</a><a class="sf-link" href="${url}" title="${url}">${title}</a>`)
        .data('id', id)
    const titleUpper = title.toUpperCase()
    const nextLi = $('.sf-favourites li')
        .filter(function () {return $(this).find('.sf-link').text().toUpperCase() > titleUpper})
    if (nextLi.length > 0) {
        nextLi.first().before(newItem)
    }
    else {
        $('.sf-favourites').append(newItem)
    }
}

function removeFromFavourites (listItem) {
    bookmarker.remove(listItem.data('id'))
    .then(() => {
        listItem.addClass('deleted')
            .on('transitionend', () => { listItem.remove() })
    })
}

function goToFavourite (listItem) {
    const url = listItem.find('.sf-link').attr('href')
    chrome.tabs.query({currentWindow: true, active: true}, tabs => {
        chrome.scripting.executeScript({
            //func: () => document.location = url,
            func: (url) => {
                console.log(`SF===> document.location = ${url}`)
                document.location = url
            },
            args: [url],
            target: { tabId: tabs[0].id },
        })
    })
}

// End of IIFE
})()
