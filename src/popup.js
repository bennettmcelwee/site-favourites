// IIFE
(() => {

const EXTENSION_NAME = 'Site Favourites';
const EXTENSION_VERSION = '1.0'; // Can't read the manifest from here

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
    .then((otherBookmarksFolder) => bookmarker.getChildByTitle(otherBookmarksFolder.id, EXTENSION_NAME))

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
            return getOrCreateExtFolder().then((extFolder) =>
                bookmarker.create({
                    parentId: extFolder.id,
                    title: domain
                })
            )
        }
    })

const saveBookmark = (domain, bookmark) =>
    getOrCreateDmnFolder(domain)
    .then((dmnFolder) =>
        bookmarker.getChildByUrl(dmnFolder.id, bookmark.url)
        .then((existing) => {
            if (existing) {
                return bookmarker.update(existing.id, {
                   title: bookmark.title,
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

initialise()
return

function initialise () {
    chrome.tabs.query({currentWindow: true, active: true}, tabs => {
        if (tabs[0]) {
            fullDomain = new URL(tabs[0].url).hostname
            baseDomain = getBaseDomain(fullDomain)
            setDomain(fullDomain)
            if (fullDomain !== baseDomain) {
                $('.sf-site-selector').addClass('enabled').on('click', onToggleDomain)
            }
        }
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
}

function addToFavourites ({title, url} = {}) {
    if (url) {
        title = title || url
        saveBookmark(currentDomain, {title, url}).then((bookmark) => {
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
    $('.sf-favourites li').filter(function () {return $(this).find('.sf-link').attr('href') === url}).remove()
    const newItem = $(`<li><a href="#" class="sf-remove">&times;</a><a class="sf-link" href="${url}" title="${url}">${title}</a>`)
        .data('id', id)
    $('.sf-favourites').append(newItem)
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
    chrome.tabs.executeScript({
        code: `document.location="${url}"`
    })
}

// End of IIFE
})();
