/*! ******************************************************************************
 *
 * Pentaho
 *
 * Copyright (C) 2024 by Hitachi Vantara, LLC : http://www.pentaho.com
 *
 * Use of this software is governed by the Business Source License included
 * in the LICENSE.TXT file.
 *
 * Change Date: 2028-08-13
 ******************************************************************************/
/* Overridden due to BACKLOG-36893
  see comments starting with // Pentaho
*/

define([
  "require",
  "dojo/_base/array", // Array.forEach array.indexOf array.map
  "dojo/aspect",
  "dojo/_base/declare", // Declare
  "dojo/Deferred", // Deferred
  "dojo/dom", // Dom.isDescendant
  "dojo/dom-class", // DomClass.add domClass.contains
  "dojo/dom-geometry", // DomGeometry.position
  "dojo/dom-style", // DomStyle.set
  "dojo/_base/fx", // Fx.fadeIn fx.fadeOut
  "dojo/i18n", // I18n.getLocalization
  "dojo/keys",
  "dojo/_base/lang", // Lang.mixin lang.hitch
  "dojo/on",
  "dojo/ready",
  "dojo/sniff", // Has("ie") has("opera") has("dijit-legacy-requires")
  "dojo/window", // WinUtils.getBox, winUtils.get
  "dojo/dnd/Moveable", // Moveable
  "dojo/dnd/TimedMoveable", // TimedMoveable
  "./focus",
  "./_base/manager", // Manager.defaultDuration
  "./_Widget",
  "./_TemplatedMixin",
  "./_CssStateMixin",
  "./form/_FormMixin",
  "./_DialogMixin",
  "./DialogUnderlay",
  "./layout/ContentPane",
  "dojo/text!./templates/Dialog.html",
  "dojo/i18n!./nls/common"
], function(require, array, aspect, declare, Deferred,
            dom, domClass, domGeometry, domStyle, fx, i18n, keys, lang, on, ready, has, winUtils,
            Moveable, TimedMoveable, focus, manager, _Widget, _TemplatedMixin, _CssStateMixin, _FormMixin, _DialogMixin,
            DialogUnderlay, ContentPane, template) {

  // Module:
  //		dijit/Dialog

  var _DialogBase = declare("dijit._DialogBase" + (has("dojo-bidi") ? "_NoBidi" : ""), [_TemplatedMixin, _FormMixin, _DialogMixin, _CssStateMixin], {
    templateString: template,

    baseClass: "dijitDialog",

    cssStateNodes: {
      closeButtonNode: "dijitDialogCloseIcon"
    },

    // Map widget attributes to DOMNode attributes.
    _setTitleAttr: {node: "titleNode", type: "innerHTML"},

    // Open: [readonly] Boolean
    //		True if Dialog is currently displayed on screen.
    open: false,

    // Duration: Integer
    //		The time in milliseconds it takes the dialog to fade in and out
    duration: manager.defaultDuration,

    // Refocus: Boolean
    //		A Toggle to modify the default focus behavior of a Dialog, which
    //		is to re-focus the element which had focus before being opened.
    //		False will disable refocusing. Default: true
    refocus: true,

    // Autofocus: Boolean
    //		A Toggle to modify the default focus behavior of a Dialog, which
    //		is to focus on the first dialog element after opening the dialog.
    //		False will disable autofocusing. Default: true
    autofocus: true,

    // _firstFocusItem: [private readonly] DomNode
    //		The pointer to the first focusable node in the dialog.
    //		Set by `dijit/_DialogMixin._getFocusItems()`.
    _firstFocusItem: null,

    // _lastFocusItem: [private readonly] DomNode
    //		The pointer to which node has focus prior to our dialog.
    //		Set by `dijit/_DialogMixin._getFocusItems()`.
    _lastFocusItem: null,

    // DoLayout: [protected] Boolean
    //		Don't change this parameter from the default value.
    //		This ContentPane parameter doesn't make sense for Dialog, since Dialog
    //		is never a child of a layout container, nor can you specify the size of
    //		Dialog in order to control the size of an inner widget.
    doLayout: false,

    // Draggable: Boolean
    //		Toggles the movable aspect of the Dialog. If true, Dialog
    //		can be dragged by it's title. If false it will remain centered
    //		in the viewport.
    draggable: true,

    // DialogOpener: DomNode
    // Pentaho - Added to fix WCAG's focus-order when the dialogs are closed.
    //      Especially for the dialogs that are opened via popupmenu.
    //      Restores the focus back to element that opened popupmenu.
    dialogOpener: null,

    // ElementRefresher: function(Element) : Element
    // Pentaho - Added to support WCAG focus maintenance.
    // Allows "refreshing" the element to use for "refocus" to a corresponding one which is attached
    // to the document. Required to deal with UI elements which are discarded and rebuilt.
    elementRefresher: null,

    _setDraggableAttr: function(/* Boolean*/ val) {
      // Avoid _WidgetBase behavior of copying draggable attribute to this.domNode,
      // as that prevents text select on modern browsers (#14452)
      this._set("draggable", val);
    },

    // MaxRatio: Number
    //		Maximum size to allow the dialog to expand to, relative to viewport size
    maxRatio: 0.9,

    // Closable: Boolean
    //		Dialog show [x] icon to close itself, and ESC key will close the dialog.
    closable: true,

    _setClosableAttr: function(val) {
      this.closeButtonNode.style.display = val ? "" : "none";
      this._set("closable", val);
    },

    postMixInProperties: function() {
      var _nlsResources = i18n.getLocalization("dijit", "common");
      lang.mixin(this, _nlsResources);
      this.inherited(arguments);
    },

    postCreate: function() {
      domStyle.set(this.domNode, {
        display: "none",
        position: "absolute"
      });
      this.ownerDocumentBody.appendChild(this.domNode);

      this.inherited(arguments);

      aspect.after(this, "onExecute", lang.hitch(this, "hide"), true);
      aspect.after(this, "onCancel", lang.hitch(this, "hide"), true);

      this._modalconnects = [];
    },

    onLoad: function() {
      // Summary:
      //		Called when data has been loaded from an href.
      //		Unlike most other callbacks, this function can be connected to (via `dojo.connect`)
      //		but should *not* be overridden.
      // tags:
      //		callback

      // when href is specified we need to reposition the dialog after the data is loaded
      // and find the focusable elements
      this._size();
      this._position();

      if(this.autofocus && DialogLevelManager.isTop(this)) {
        this._getFocusItems(this.domNode);
        focus.focus(this._firstFocusItem);
      }

      this.inherited(arguments);
    },

    focus: function() {
      this._getFocusItems(this.domNode);
      focus.focus(this._firstFocusItem);
    },

    _endDrag: function() {
      // Summary:
      //		Called after dragging the Dialog. Saves the position of the dialog in the viewport,
      //		and also adjust position to be fully within the viewport, so user doesn't lose access to handle
      var nodePosition = domGeometry.position(this.domNode);
      var viewport = winUtils.getBox(this.ownerDocument);
      nodePosition.y = Math.min(Math.max(nodePosition.y, 0), (viewport.h - nodePosition.h));
      nodePosition.x = Math.min(Math.max(nodePosition.x, 0), (viewport.w - nodePosition.w));
      this._relativePosition = nodePosition;
      this._position();
    },

    _setup: function() {
      // Summary:
      //		Stuff we need to do before showing the Dialog for the first
      //		time (but we defer it until right beforehand, for
      //		performance reasons).
      // tags:
      //		private

      var node = this.domNode;

      if(this.titleBar && this.draggable) {
        this._moveable = new ((has("ie") == 6) ? TimedMoveable // Prevent overload, see #5285
          : Moveable)(node, {handle: this.titleBar});
        aspect.after(this._moveable, "onMoveStop", lang.hitch(this, "_endDrag"), true);
      } else {
        domClass.add(node, "dijitDialogFixed");
      }

      this.underlayAttrs = {
        dialogId: this.id,
        "class": array.map(this.class.split(/\s/), function(s) {
          return s + "_underlay";
        })
          .join(" "),
        _onKeyDown: lang.hitch(this, "_onKey"),
        ownerDocument: this.ownerDocument
      };
    },

    _size: function() {
      // Summary:
      //		If necessary, shrink dialog contents so dialog fits in viewport.
      // tags:
      //		private

      this._checkIfSingleChild();

      // If we resized the dialog contents earlier, reset them back to original size, so
      // that if the user later increases the viewport size, the dialog can display w/out a scrollbar.
      // Need to do this before the domGeometry.position(this.domNode) call below.
      if(this._singleChild) {
        if(typeof this._singleChildOriginalStyle !== "undefined") {
          this._singleChild.domNode.style.cssText = this._singleChildOriginalStyle;
          delete this._singleChildOriginalStyle;
        }
      } else {
        domStyle.set(this.containerNode, {
          width: "auto",
          height: "auto"
        });
      }

      var bb = domGeometry.position(this.domNode);

      // Get viewport size but then reduce it by a bit; Dialog should always have some space around it
      // to indicate that it's a popup.  This will also compensate for possible scrollbars on viewport.
      var viewport = winUtils.getBox(this.ownerDocument);
      viewport.w *= this.maxRatio;
      viewport.h *= this.maxRatio;

      if(bb.w >= viewport.w || bb.h >= viewport.h) {
        // Reduce size of dialog contents so that dialog fits in viewport

        var containerSize = domGeometry.position(this.containerNode);
        var w = Math.min(bb.w, viewport.w) - (bb.w - containerSize.w);
        var h = Math.min(bb.h, viewport.h) - (bb.h - containerSize.h);

        if(this._singleChild && this._singleChild.resize) {
          if(typeof this._singleChildOriginalStyle === "undefined") {
            this._singleChildOriginalStyle = this._singleChild.domNode.style.cssText;
          }
          this._singleChild.resize({w: w, h: h});
        } else {
          domStyle.set(this.containerNode, {
            width: w + "px",
            height: h + "px",
            overflow: "auto",
            position: "relative" // Workaround IE bug moving scrollbar or dragging dialog
          });
        }
      } else if(this._singleChild && this._singleChild.resize) {
        this._singleChild.resize();
      }
    },

    _position: function() {
      // Summary:
      //		Position the dialog in the viewport.  If no relative offset
      //		in the viewport has been determined (by dragging, for instance),
      //		center the dialog.  Otherwise, use the Dialog's stored relative offset,
      //		adjusted by the viewport's scroll.
      if(!domClass.contains(this.ownerDocumentBody, "dojoMove")) { // Don't do anything if called during auto-scroll
        var node = this.domNode;
        var viewport = winUtils.getBox(this.ownerDocument);
        var p = this._relativePosition;
        var bb = p ? null : domGeometry.position(node);
        var l = Math.floor(viewport.l + (p ? p.x : (viewport.w - bb.w) / 2));
        var t = Math.floor(viewport.t + (p ? p.y : (viewport.h - bb.h) / 2))
        ;
        domStyle.set(node, {
          left: l + "px",
          top: t + "px"
        });
      }
    },

    _onKey: function(/* Event*/ evt) {
      // Summary:
      //		Handles the keyboard events for accessibility reasons
      // tags:
      //		private

      if(evt.keyCode == keys.TAB) {
        this._getFocusItems(this.domNode);
        var node = evt.target;
        if(this._firstFocusItem == this._lastFocusItem) {
          // Don't move focus anywhere, but don't allow browser to move focus off of dialog either
          evt.stopPropagation();
          evt.preventDefault();
        } else if(node == this._firstFocusItem && evt.shiftKey) {
          // If we are shift-tabbing from first focusable item in dialog, send focus to last item
          focus.focus(this._lastFocusItem);
          evt.stopPropagation();
          evt.preventDefault();
        } else if(node == this._lastFocusItem && !evt.shiftKey) {
          // If we are tabbing from last focusable item in dialog, send focus to first item
          focus.focus(this._firstFocusItem);
          evt.stopPropagation();
          evt.preventDefault();
        }
      } else if(this.closable && evt.keyCode == keys.ESCAPE) {
        this.onCancel();
        evt.stopPropagation();
        evt.preventDefault();
      }
    },

    // Pentaho setter for dialogOpener
    setDialogOpener: function(opener) {
      this.dialogOpener = opener;
    },

    // Pentaho setter for element refresher
    setElementRefresher: function(refresher) {
      this.elementRefresher = refresher;
    },

    // Pentaho: refreshes an element
    _refreshElement: function(elem) {
      if(elem != null && this.elementRefresher != null) {
        return this.elementRefresher.call(null, elem);
      }

      return elem;
    },

    show: function() {
      // Summary:
      //		Display the dialog
      // returns: dojo/promise/Promise
      //		Promise object that resolves when the display animation is complete

      if(this.open) {
        return;
      }

      if(!this._started) {
        this.startup();
      }

      // First time we show the dialog, there's some initialization stuff to do
      if(!this._alreadyInitialized) {
        this._setup();
        this._alreadyInitialized = true;
      }

      if(this._fadeOutDeferred) {
        // There's a hide() operation in progress, so cancel it, but still call DialogLevelManager.hide()
        // as though the hide() completed, in preparation for the DialogLevelManager.show() call below.
        this._fadeOutDeferred.cancel();
        DialogLevelManager.hide(this);
      }

      // Recenter Dialog if user scrolls browser.  Connecting to document doesn't work on IE, need to use window.
      var win = winUtils.get(this.ownerDocument);
      this._modalconnects.push(on(win, "scroll", lang.hitch(this, "resize")));

      this._modalconnects.push(on(this.domNode, "keydown", lang.hitch(this, "_onKey")));

      domStyle.set(this.domNode, {
        opacity: 0,
        display: ""
      });

      this._set("open", true);
      this._onShow(); // Lazy load trigger

      this._size();
      this._position();

      // Fade-in Animation object, setup below
      var fadeIn;

      this._fadeInDeferred = new Deferred(lang.hitch(this, function() {
        fadeIn.stop();
        delete this._fadeInDeferred;
      }));

      // If delay is 0, code below will delete this._fadeInDeferred instantly, so grab promise while we can.
      var promise = this._fadeInDeferred.promise;

      fadeIn = fx.fadeIn({
        node: this.domNode,
        duration: this.duration,
        beforeBegin: lang.hitch(this, function() {
          DialogLevelManager.show(this, this.underlayAttrs);
        }),
        onEnd: lang.hitch(this, function() {
          if(this.autofocus && DialogLevelManager.isTop(this)) {
            // Find focusable items each time dialog is shown since if dialog contains a widget the
            // first focusable items can change
            this._getFocusItems(this.domNode);
            focus.focus(this._firstFocusItem);
          }
          this._fadeInDeferred.resolve(true);
          delete this._fadeInDeferred;
        })
      })
        .play();

      return promise;
    },

    hide: function() {
      // Summary:
      //		Hide the dialog
      // returns: dojo/promise/Promise
      //		Promise object that resolves when the display animation is complete

      // If we haven't been initialized yet then we aren't showing and we can just return.
      // Likewise if we are already hidden, or are currently fading out.
      if(!this._alreadyInitialized || !this.open) {
        return;
      }
      if(this._fadeInDeferred) {
        this._fadeInDeferred.cancel();
      }

      // Fade-in Animation object, setup below
      var fadeOut;

      this._fadeOutDeferred = new Deferred(lang.hitch(this, function() {
        fadeOut.stop();
        delete this._fadeOutDeferred;
      }));

      // Fire onHide when the promise resolves.
      this._fadeOutDeferred.then(lang.hitch(this, "onHide"));

      // If delay is 0, code below will delete this._fadeOutDeferred instantly, so grab promise while we can.
      var promise = this._fadeOutDeferred.promise;

      fadeOut = fx.fadeOut({
        node: this.domNode,
        duration: this.duration,
        onEnd: lang.hitch(this, function() {
          this.domNode.style.display = "none";
          DialogLevelManager.hide(this);
          this._fadeOutDeferred.resolve(true);
          delete this._fadeOutDeferred;
        })
      })
        .play();

      if(this._scrollConnected) {
        this._scrollConnected = false;
      }
      var h;
      while(h = this._modalconnects.pop()) {
        h.remove();
      }

      if(this._relativePosition) {
        delete this._relativePosition;
      }
      this._set("open", false);

      return promise;
    },

    resize: function() {
      // Summary:
      //		Called when viewport scrolled or size changed.  Adjust Dialog as necessary to keep it visible.
      // tags:
      //		private
      if(this.domNode.style.display != "none") {
        this._size();
        if(!has("touch")) {
          // If the user has scrolled the display then reposition the Dialog.  But don't do it for touch
          // devices, because it will counteract when a keyboard pops up and then the browser auto-scrolls
          // the focused node into view.
          this._position();
        }
      }
    },

    destroy: function() {
      if(this._fadeInDeferred) {
        this._fadeInDeferred.cancel();
      }
      if(this._fadeOutDeferred) {
        this._fadeOutDeferred.cancel();
      }
      if(this._moveable) {
        this._moveable.destroy();
      }
      var h;
      while(h = this._modalconnects.pop()) {
        h.remove();
      }

      DialogLevelManager.hide(this);

      this.inherited(arguments);
    }
  });

  if(has("dojo-bidi")) {
    _DialogBase = declare("dijit._DialogBase", _DialogBase, {
      _setTitleAttr: function(/* String*/ title) {
        this._set("title", title);
        this.titleNode.innerHTML = title;
        this.applyTextDir(this.titleNode);
      },

      _setTextDirAttr: function(textDir) {
        if(this._created && this.textDir != textDir) {
          this._set("textDir", textDir);
          this.set("title", this.title);
        }
      }
    });
  }

  var Dialog = declare("dijit.Dialog", [ContentPane, _DialogBase], {
    // Summary:
    //		A modal dialog Widget.
    // description:
    //		Pops up a modal dialog window, blocking access to the screen
    //		and also graying out the screen Dialog is extended from
    //		ContentPane so it supports all the same parameters (href, etc.).
    // example:
    // |	<div data-dojo-type="dijit/Dialog" data-dojo-props="href: 'test.html'"></div>
    // example:
    // |	var foo = new Dialog({ title: "test dialog", content: "test content" });
    // |	foo.placeAt(win.body());
    // |	foo.startup();
  });
  Dialog._DialogBase = _DialogBase;	// For monkey patching and dojox/widget/DialogSimple

  var DialogLevelManager = Dialog._DialogLevelManager = {
    // Summary:
    //		Controls the various active "levels" on the page, starting with the
    //		stuff initially visible on the page (at z-index 0), and then having an entry for
    //		each Dialog shown.

    _beginZIndex: 950,

    show: function(/* dijit/_WidgetBase*/ dialog, /* Object*/ underlayAttrs) {
      // Summary:
      //		Call right before fade-in animation for new dialog.
      //		Saves current focus, displays/adjusts underlay for new dialog,
      //		and sets the z-index of the dialog itself.
      //
      //		New dialog will be displayed on top of all currently displayed dialogs.
      //
      //		Caller is responsible for setting focus in new dialog after the fade-in
      //		animation completes.

      // Save current focus
      ds[ds.length - 1].focus = focus.curNode;

      // Set z-index a bit above previous dialog
      var zIndex = ds[ds.length - 1].dialog ? ds[ds.length - 1].zIndex + 2 : Dialog._DialogLevelManager._beginZIndex;
      domStyle.set(dialog.domNode, "zIndex", zIndex);

      // Display the underlay, or if already displayed then adjust for this new dialog
      DialogUnderlay.show(underlayAttrs, zIndex - 1);

      ds.push({dialog: dialog, underlayAttrs: underlayAttrs, zIndex: zIndex});
    },

    hide: function(/* dijit/_WidgetBase*/ dialog) {
      // Summary:
      //		Called when the specified dialog is hidden/destroyed, after the fade-out
      //		animation ends, in order to reset page focus, fix the underlay, etc.
      //		If the specified dialog isn't open then does nothing.
      //
      //		Caller is responsible for either setting display:none on the dialog domNode,
      //		or calling dijit/popup.hide(), or removing it from the page DOM.

      if(ds[ds.length - 1].dialog == dialog) {
        // Removing the top (or only) dialog in the stack, return focus
        // to previous dialog

        ds.pop();

        var pd = ds[ds.length - 1];	// The new active dialog (or the base page itself)

        // Adjust underlay
        if(ds.length == 1) {
          // Returning to original page.  Hide the underlay.
          DialogUnderlay.hide();
        } else {
          // Popping back to previous dialog, adjust underlay.
          DialogUnderlay.show(pd.underlayAttrs, pd.zIndex - 1);
        }

        // Adjust focus.
        // TODO: regardless of setting of dialog.refocus, if the execute() method set focus somewhere,
        // don't shift focus back to button.  Note that execute() runs at the start of the fade-out but
        // this code runs later, at the end of the fade-out.  Menu has code like this.
        if(dialog.refocus) {
          var focus;
          // Pentaho - BACKLOG-36893 hack
          if(dialog.dialogOpener) {
            focus = dialog._refreshElement(dialog.dialogOpener);
            dialog.dialogOpener = null;
            // End of BACKLOG-36893 hack
          } else {
            // If we are returning control to a previous dialog but for some reason
            // that dialog didn't have a focused field, set focus to first focusable item.
            // This situation could happen if two dialogs appeared at nearly the same time,
            // since a dialog doesn't set it's focus until the fade-in is finished.

            // Pentaho - BACKLOG-36893
            focus = dialog._refreshElement(pd.focus);
            // End of BACKLOG-36893

            if(pd.dialog && (!focus || !dom.isDescendant(focus, pd.dialog.domNode))) {
              pd.dialog._getFocusItems(pd.dialog.domNode);
              focus = pd.dialog._firstFocusItem;
            }
          }

          if(focus) {
            // Refocus the button that spawned the Dialog.   This will fail in corner cases including
            // page unload on IE, because the dijit/form/Button that launched the Dialog may get destroyed
            // before this code runs.  (#15058)
            try {
              focus.focus();
            } catch(e) {
            }
          }
        }
      } else {
        // Removing a dialog out of order (#9944, #10705).
        // Don't need to mess with underlay or z-index or anything.
        var idx = array.indexOf(array.map(ds, function(elem) {
          return elem.dialog;
        }), dialog);
        if(idx != -1) {
          ds.splice(idx, 1);
        }
      }
    },

    isTop: function(/* dijit/_WidgetBase*/ dialog) {
      // Summary:
      //		Returns true if specified Dialog is the top in the task
      return ds[ds.length - 1].dialog == dialog;
    }
  };

  // Stack representing the various active "levels" on the page, starting with the
  // stuff initially visible on the page (at z-index 0), and then having an entry for
  // each Dialog shown.
  // Each element in stack has form {
  //		dialog: dialogWidget,
  //		focus: returnFromGetFocus(),
  //		underlayAttrs: attributes to set on underlay (when this widget is active)
  // }
  var ds = Dialog._dialogStack = [
    {dialog: null, focus: null, underlayAttrs: null} // Entry for stuff at z-index: 0
  ];

  // If focus was accidentally removed from the dialog, such as if the user clicked a blank
  // area of the screen, or clicked the browser's address bar and then tabbed into the page,
  // then refocus.   Won't do anything if focus was removed because the Dialog was closed, or
  // because a new Dialog popped up on top of the old one, or when focus moves to popups
  focus.watch("curNode", function(attr, oldNode, node) {
    // Note: if no dialogs, ds.length==1 but ds[ds.length-1].dialog is null
    var topDialog = ds[ds.length - 1].dialog;

    function isGwtModalDialogNode(node) {
      return domClass.contains(node, "pentaho-gwt") && domClass.contains(node, "pentaho-dialog") && domClass.contains(node, "modal");
    }

    // If a node was focused, and there's a Dialog currently showing, and not in the process of fading out...
    // Ignore focus events on other document though because it's likely an Editor inside of the Dialog.
    if(node && topDialog && !topDialog._fadeOutDeferred && node.ownerDocument == topDialog.ownerDocument) {
      // If the node that was focused is inside the dialog or in a popup, even a context menu that isn't
      // technically a descendant of the the dialog, don't do anything.
      do {
        if(node == topDialog.domNode || domClass.contains(node, "dijitPopup") || isGwtModalDialogNode(node)) {
          return;
        }
      } while(node = node.parentNode);

      // Otherwise, return focus to the dialog.  Use a delay to avoid confusing dijit/focus code's
      // own tracking of focus.
      topDialog.focus();
    }
  });

  // Back compat w/1.6, remove for 2.0
  if(has("dijit-legacy-requires")) {
    ready(0, function() {
      var requires = ["dijit/TooltipDialog"];
      require(requires);	// Use indirection so modules not rolled into a build
    });
  }

  return Dialog;
});
