import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Col,
  InputGroup,
  Overlay,
  Popover,
  Form,
  Row,
  Dropdown,
} from "react-bootstrap";
import cx from "classnames";
import Mousetrap from "mousetrap";

import { Icon } from "src/components/Shared/Icon";
import { LoadingIndicator } from "src/components/Shared/LoadingIndicator";
import useInterval from "../Interval";
import usePageVisibility from "../PageVisibility";
import { useToast } from "../Toast";
import { FormattedMessage, useIntl } from "react-intl";
import { useConfigurationContext } from "../Config";
import PhotoSwipe from "photoswipe";
import "photoswipe/style.css";
import { Link } from "react-router-dom";
import { OCounterButton } from "src/components/Scenes/SceneDetails/OCounterButton";
import {
  mutateImageIncrementO,
  mutateImageDecrementO,
  mutateImageResetO,
  useImageUpdate,
} from "src/core/StashService";
import * as GQL from "src/core/generated-graphql";
import { useInterfaceLocalForage } from "../LocalForage";
import { imageLightboxDisplayModeIntlMap } from "src/core/enums";
import { ILightboxImage, IChapter } from "./types";
import { setupDoubleTapDragZoom } from "./useDoubleTapDragZoom";
import {
  faArrowLeft,
  faArrowRight,
  faChevronLeft,
  faChevronRight,
  faCog,
  faExpand,
  faPause,
  faPlay,
  faTimes,
  faBars,
  faImages,
} from "@fortawesome/free-solid-svg-icons";
import { RatingSystem } from "src/components/Shared/Rating/RatingSystem";
import { isVideo } from "src/utils/visualFile";
import ScreenUtils from "src/utils/screen";
import { imageTitle } from "src/core/files";
import { galleryTitle } from "src/core/galleries";

const CLASSNAME = "Lightbox";
const CLASSNAME_HEADER = `${CLASSNAME}-header`;
const CLASSNAME_LEFT_SPACER = `${CLASSNAME_HEADER}-left-spacer`;
const CLASSNAME_CHAPTERS = `${CLASSNAME_HEADER}-chapters`;
const CLASSNAME_CHAPTER_BUTTON = `${CLASSNAME_HEADER}-chapter-button`;
const CLASSNAME_INDICATOR = `${CLASSNAME_HEADER}-indicator`;
const CLASSNAME_OPTIONS = `${CLASSNAME_HEADER}-options`;
const CLASSNAME_OPTIONS_ICON = `${CLASSNAME_OPTIONS}-icon`;
const CLASSNAME_OPTIONS_INLINE = `${CLASSNAME_OPTIONS}-inline`;
const CLASSNAME_RIGHT = `${CLASSNAME_HEADER}-right`;
const CLASSNAME_FOOTER = `${CLASSNAME}-footer`;
const CLASSNAME_FOOTER_LEFT = `${CLASSNAME_FOOTER}-left`;
const CLASSNAME_FOOTER_CENTER = `${CLASSNAME_FOOTER}-center`;
const CLASSNAME_FOOTER_RIGHT = `${CLASSNAME_FOOTER}-right`;
const CLASSNAME_DISPLAY = `${CLASSNAME}-display`;
const CLASSNAME_CAROUSEL = `${CLASSNAME}-carousel`;
const CLASSNAME_IMAGE = `${CLASSNAME_CAROUSEL}-image`;
const CLASSNAME_NAVBUTTON = `${CLASSNAME}-navbutton`;
const CLASSNAME_NAV = `${CLASSNAME}-nav`;
const CLASSNAME_NAVIMAGE = `${CLASSNAME_NAV}-image`;
const CLASSNAME_NAVSELECTED = `${CLASSNAME_NAV}-selected`;

const DEFAULT_SLIDESHOW_DELAY = 5000;
const SECONDS_TO_MS = 1;
const MIN_VALID_INTERVAL_SECONDS = 1;

interface IProps {
  images: ILightboxImage[];
  isVisible: boolean;
  isLoading: boolean;
  initialIndex?: number;
  showNavigation: boolean;
  slideshowEnabled?: boolean;
  page?: number;
  pages?: number;
  pageSize?: number;
  pageCallback?: (props: { direction?: number; page?: number }) => void;
  chapters?: IChapter[];
  hide: () => void;
}

export const LightboxComponent: React.FC<IProps> = ({
  images,
  isVisible,
  isLoading,
  initialIndex = 0,
  showNavigation,
  slideshowEnabled = false,
  page,
  pages,
  pageSize: pageSize = 40,
  pageCallback,
  chapters = [],
  hide,
}) => {
  const [updateImage] = useImageUpdate();

  // zero-based
  const [index, setIndex] = useState<number | null>(null);
  const oldIndex = useRef<number | null>(null);
  const [isSwitchingPage, setIsSwitchingPage] = useState(true);
  const [isFullscreen, setFullscreen] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [navOffset, setNavOffset] = useState<React.CSSProperties | undefined>();

  const oldImages = useRef<ILightboxImage[]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayTarget = useRef<HTMLButtonElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);
  const clearIntervalCallback = useRef<() => void>();
  const resetIntervalCallback = useRef<() => void>();

  const allowNavigation = images.length > 1 || Boolean(pageCallback);

  const Toast = useToast();
  const intl = useIntl();
  const { configuration: config } = useConfigurationContext();
  const [interfaceLocalForage, setInterfaceLocalForage] =
    useInterfaceLocalForage();

  const lightboxSettings = interfaceLocalForage.data?.imageLightbox;

  function setLightboxSettings(v: Partial<GQL.ConfigImageLightboxInput>) {
    setInterfaceLocalForage((prev) => {
      return {
        ...prev,
        imageLightbox: {
          ...prev.imageLightbox,
          ...v,
        },
      };
    });
  }

  function setScaleUp(value: boolean) {
    setLightboxSettings({ scaleUp: value });
  }

  function setResetZoomOnNav(v: boolean) {
    setLightboxSettings({ resetZoomOnNav: v });
  }

  function setScrollMode(v: GQL.ImageLightboxScrollMode) {
    setLightboxSettings({ scrollMode: v });
  }

  const configuredDelay = config?.interface.imageLightbox.slideshowDelay
    ? config.interface.imageLightbox.slideshowDelay * SECONDS_TO_MS
    : undefined;

  const savedDelay = lightboxSettings?.slideshowDelay
    ? lightboxSettings.slideshowDelay * SECONDS_TO_MS
    : undefined;

  const slideshowDelay =
    savedDelay ?? configuredDelay ?? DEFAULT_SLIDESHOW_DELAY;

  function setSlideshowDelay(v: number) {
    setLightboxSettings({ slideshowDelay: v });
  }

  const scaleUp =
    lightboxSettings?.scaleUp ??
    config?.interface.imageLightbox.scaleUp ??
    false;

  const resetZoomOnNav =
    lightboxSettings?.resetZoomOnNav ??
    config?.interface.imageLightbox.resetZoomOnNav ??
    false;

  const scrollMode =
    lightboxSettings?.scrollMode ??
    config?.interface.imageLightbox.scrollMode ??
    GQL.ImageLightboxScrollMode.Zoom;

  const displayMode =
    lightboxSettings?.displayMode ??
    config?.interface.imageLightbox.displayMode ??
    GQL.ImageLightboxDisplayMode.FitXy;
  const oldDisplayMode = useRef(displayMode);

  function setDisplayMode(v: GQL.ImageLightboxDisplayMode) {
    setLightboxSettings({ displayMode: v });
  }

  // slideshowInterval is used for controlling the logic
  // displaySlideshowInterval is for display purposes only
  // keeping them separate and independant allows us to handle the logic however we want
  // while still displaying something that makes sense to the user
  const [slideshowInterval, setSlideshowInterval] = useState<number | null>(
    null
  );

  const [displayedSlideshowInterval, setDisplayedSlideshowInterval] =
    useState<string>((slideshowDelay / SECONDS_TO_MS).toString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pswpRef = useRef<any>(null);
  const hashSetRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const closeRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleLeftRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRightRef = useRef<any>(null);
  const allowNavigationRef = useRef<boolean>(allowNavigation);
  const isSwitchingPageRef = useRef<boolean>(isSwitchingPage);
  const pageChangeCountRef = useRef(0);

  const close = useCallback(
    (navigating = false) => {
      if (isFullscreen) document.exitFullscreen();

      if (!navigating && window.location.hash === "#lightbox") {
        if (pageChangeCountRef.current > 0) {
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search
          );
        } else {
          window.history.back();
        }
      }

      hide();
      document.body.style.overflow = "auto";
      Mousetrap.unpause();
    },
    [isFullscreen, hide]
  );

  closeRef.current = close;

  useEffect(() => {
    if (!isVisible || images.length === 0) {
      return;
    }

    const dataSource = [
      {
        html: '<div style="width:100%;height:100%;background:transparent;"></div>',
      },
      ...images.map((img) => {
        const isVid = isVideo(img.visual_files?.[0] ?? {});
        if (isVid) {
          return {
            html: `<div class="pswp-video-container" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;">
              <video src="${
                img.paths.image || ""
              }" controls autoPlay loop style="max-width:100%;max-height:100%;object-fit:contain;"></video>
            </div>`,
          };
        } else {
          return {
            src: img.paths.image || "",
            width: img.visual_files?.[0]?.width || 1200,
            height: img.visual_files?.[0]?.height || 800,
            autoSize: !img.visual_files?.[0]?.width,
            alt: img.title || "",
          };
        }
      }),
      {
        html: '<div style="width:100%;height:100%;background:transparent;"></div>',
      },
    ];

    let startIndex = index === null ? initialIndex : index;
    if (startIndex === -1) {
      startIndex = images.length - 1;
    }
    // Shift by 1 because of the leading blank slide
    startIndex = startIndex + 1;

    const handleTap = (
      point?: { x?: number; y?: number },
      originalEvent?: PointerEvent
    ) => {
      const x = point?.x ?? originalEvent?.clientX;
      const screenWidth =
        window.innerWidth ||
        document.documentElement.clientWidth ||
        document.body.clientWidth;

      if (x !== undefined && screenWidth > 0 && allowNavigationRef.current) {
        // Far left: navigate to previous image
        if (x < screenWidth * 0.2) {
          handleLeftRef.current?.();
          return;
        }

        // Far right: navigate to next image
        if (x > screenWidth * 0.8) {
          handleRightRef.current?.();
          return;
        }
      }

      setShowControls((prev) => !prev);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PhotoSwipeClass = (PhotoSwipe as any).default || PhotoSwipe;
    console.log("creating new photoswipe with index", startIndex);
    const pswp = new PhotoSwipeClass({
      dataSource,
      index: startIndex,
      close: false,
      zoom: false,
      arrowPrev: false,
      arrowNext: false,
      counter: false,
      bgOpacity: 1,
      showAnimationDuration: 0,
      hideAnimationDuration: 0,
      loop: false, // Disable loop mode so we can swipe past boundaries and trigger page changes
      imageClickAction: ScreenUtils.isTouch() ? handleTap : "zoom",
      bgClickAction: ScreenUtils.isTouch()
        ? handleTap
        : () => {
            setShowControls((prev) => !prev);
          },
      tapAction: handleTap,
    });

    let wasZoomedIn = false;

    pswp.on("change", () => {
      wasZoomedIn = false;
      if (isSwitchingPageRef.current) return;

      const newIndex = pswp.currIndex;

      if (newIndex === 0) {
        handleLeftRef.current();
        return;
      }

      if (newIndex === dataSource.length - 1) {
        handleRightRef.current();
        return;
      }

      const actualIndex = newIndex - 1;

      setIndex(actualIndex);
      if (pswpRef.current) {
        pswpRef.current.prevIndex = newIndex;
      }
    });

    pswp.on("zoomPanUpdate", () => {
      if (pswp.currSlide) {
        const isZoomedIn =
          pswp.currSlide.currZoomLevel > pswp.currSlide.zoomLevels.min * 1.05;
        if (isZoomedIn && !wasZoomedIn) {
          setShowControls(false);
        }
        wasZoomedIn = isZoomedIn;
      }
    });

    pswp.on("close", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((pswp as any)._transitioning) return;
      closeRef.current();
    });

    interface IContentLoadEvent {
      content: {
        index: number;
        data: {
          src?: string;
          width?: number;
          height?: number;
          w?: number;
          h?: number;
          autoSize?: boolean;
        };
      };
    }

    pswp.on("contentLoad", (e: IContentLoadEvent) => {
      const { content } = e;
      if (content.data && content.data.autoSize) {
        const img = new Image();
        img.onload = () => {
          content.data.width = img.naturalWidth;
          content.data.height = img.naturalHeight;
          content.data.w = img.naturalWidth;
          content.data.h = img.naturalHeight;
          content.data.autoSize = false;
          if (pswpRef.current) {
            pswpRef.current.refreshSlideContent(content.index);
          }
        };
        img.onerror = () => {
          content.data.autoSize = false;
        };
        img.src = content.data.src || "";
      }
    });

    pswp.init();
    pswpRef.current = pswp;
    pswpRef.current.prevIndex = startIndex;

    // Attach double-tap-drag-to-zoom gesture (Google Photos style)
    const cleanupDoubleTapDragZoom = setupDoubleTapDragZoom(pswp, {
      onEdgeTapLeft: () => handleLeftRef.current?.(),
      onEdgeTapRight: () => handleRightRef.current?.(),
      allowNavigation: () => allowNavigationRef.current,
    });

    return () => {
      cleanupDoubleTapDragZoom();
      if (pswpRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pswpRef.current._transitioning = true;
        pswpRef.current.close();
        pswpRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, images, initialIndex]);

  useEffect(() => {
    if (isSwitchingPage) return;

    if (
      pswpRef.current &&
      index !== null &&
      index !== -1 &&
      pswpRef.current.currIndex !== index + 1
    ) {
      pswpRef.current.goTo(index + 1);
      pswpRef.current.prevIndex = index + 1;
    }
  }, [index, isSwitchingPage]);

  useEffect(() => {
    if (!isVisible) return;

    if (!hashSetRef.current) {
      if (window.location.hash !== "#lightbox") {
        window.location.hash = "lightbox";
      }
      hashSetRef.current = true;
    }

    const handleHashChange = () => {
      if (window.location.hash !== "#lightbox") {
        closeRef.current();
      }
    };

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      hashSetRef.current = false;
    };
  }, [isVisible]);

  useEffect(() => {
    if (images !== oldImages.current && isSwitchingPage) {
      if (index === -1) {
        setIndex(images.length - 1);
      }
      setIsSwitchingPage(false);
    }
  }, [isSwitchingPage, images, index]);

  useEffect(() => {
    if (images.length < 2) return;
    if (index === oldIndex.current) return;
    if (index === null) return;

    oldIndex.current = index;
  }, [index, images.length]);

  const getNavOffset = useCallback(() => {
    if (images.length < 2) return;
    if (index === undefined || index === null) return;

    if (navRef.current) {
      const currentThumb = navRef.current.children[index + 1];
      if (currentThumb instanceof HTMLImageElement) {
        const offset =
          -1 *
          (currentThumb.offsetLeft - document.documentElement.clientWidth / 2);

        return { left: `${offset}px` };
      }
    }
  }, [index, images.length]);

  useEffect(() => {
    // reset images loaded counter for new images
    setImagesLoaded(0);
  }, [images]);

  useEffect(() => {
    setNavOffset(getNavOffset() ?? undefined);
  }, [getNavOffset]);

  useEffect(() => {
    oldDisplayMode.current = displayMode;
  }, [displayMode]);

  const selectIndex = (e: React.MouseEvent, i: number) => {
    setIndex(i);
    e.stopPropagation();
  };

  useEffect(() => {
    if (isVisible) {
      pageChangeCountRef.current = 0;
    } else {
      setShowControls(true);
    }
  }, [isVisible]);

  useEffect(() => {
    setShowControls(!isFullscreen);
  }, [isFullscreen]);

  useEffect(() => {
    if (isVisible) {
      if (index === null) {
        setIndex(initialIndex);
      }
      document.body.style.overflow = "hidden";
      Mousetrap.pause();
    }
  }, [initialIndex, isVisible, setIndex, index]);

  const toggleSlideshow = useCallback(() => {
    if (slideshowInterval) {
      setSlideshowInterval(null);
    } else {
      setSlideshowInterval(slideshowDelay);
    }
  }, [slideshowInterval, slideshowDelay]);

  // stop slideshow when the page is hidden
  usePageVisibility((hidden: boolean) => {
    if (hidden) {
      setSlideshowInterval(null);
    }
  });

  const handleClose = (e: React.MouseEvent<HTMLDivElement>) => {
    const { className } = e.target as Element;
    if (className && className.includes && className.includes(CLASSNAME_IMAGE))
      close();
  };

  const handleLeft = useCallback(
    (isUserAction = true) => {
      if (isSwitchingPage || index === -1) return;

      setShowChapters(false);

      if (index === 0) {
        // go to next page, or loop back if no callback is set
        if (pageCallback) {
          setIndex(-1);
          oldImages.current = images;
          setIsSwitchingPage(true);
          isSwitchingPageRef.current = true;
          pageChangeCountRef.current += 1;
          pageCallback({ direction: -1 });
        } else {
          setIndex(images.length - 1);
        }
      } else {
        setIndex((index ?? 0) - 1);
      }

      if (isUserAction && resetIntervalCallback.current) {
        resetIntervalCallback.current();
      }
    },
    [images, pageCallback, isSwitchingPage, resetIntervalCallback, index]
  );

  const handleRight = useCallback(
    (isUserAction = true) => {
      if (isSwitchingPage) return;

      setShowChapters(false);

      if (index === images.length - 1) {
        // go to preview page, or loop back if no callback is set
        if (pageCallback) {
          oldImages.current = images;
          setIsSwitchingPage(true);
          isSwitchingPageRef.current = true;
          setIndex(0);
          pageChangeCountRef.current += 1;
          pageCallback({ direction: 1 });
        } else {
          setIndex(0);
        }
      } else {
        setIndex((index ?? 0) + 1);
      }

      if (isUserAction && resetIntervalCallback.current) {
        resetIntervalCallback.current();
      }
    },
    [
      images,
      setIndex,
      pageCallback,
      isSwitchingPage,
      resetIntervalCallback,
      index,
    ]
  );

  handleLeftRef.current = handleLeft;
  handleRightRef.current = handleRight;
  isSwitchingPageRef.current = isSwitchingPage;
  allowNavigationRef.current = allowNavigation;

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handleLeft();
      else if (e.key === "ArrowRight") handleRight();
      else if (e.key === "Escape") close();
    },
    [handleLeft, handleRight, close]
  );

  const handleFullScreenChange = () => {
    if (clearIntervalCallback.current) {
      clearIntervalCallback.current();
    }
    setFullscreen(document.fullscreenElement !== null);
  };

  const [clearCallback, resetCallback] = useInterval(
    () => {
      handleRight(false);
    },
    slideshowEnabled ? slideshowInterval : null
  );

  resetIntervalCallback.current = resetCallback;
  clearIntervalCallback.current = clearCallback;

  useEffect(() => {
    if (isVisible) {
      document.addEventListener("keydown", handleKey);
      document.addEventListener("fullscreenchange", handleFullScreenChange);
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
    };
  }, [isVisible, handleKey]);

  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }, [isFullscreen]);

  function imageLoaded() {
    setImagesLoaded((loaded) => loaded + 1);

    if (imagesLoaded === images.length - 1) {
      // all images are loaded - update the nav offset
      setNavOffset(getNavOffset() ?? undefined);
    }
  }

  const navItems = images.map((image, i) =>
    React.createElement(image.paths.preview != "" ? "video" : "img", {
      loop: image.paths.preview != "",
      autoPlay: image.paths.preview != "",
      playsInline: image.paths.preview != "",
      src:
        image.paths.preview != ""
          ? image.paths.preview ?? ""
          : image.paths.thumbnail ?? "",
      alt: "",
      className: cx(CLASSNAME_NAVIMAGE, {
        [CLASSNAME_NAVSELECTED]: i === index,
      }),
      onClick: (e: React.MouseEvent) => selectIndex(e, i),
      role: "presentation",
      loading: "lazy",
      key: image.paths.thumbnail,
      onLoad: imageLoaded,
    })
  );

  const onDelayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let numberValue = Number.parseInt(e.currentTarget.value, 10);
    setDisplayedSlideshowInterval(e.currentTarget.value);

    // Without this exception, the blocking of updates for invalid values is even weirder
    if (e.currentTarget.value === "-" || e.currentTarget.value === "") {
      return;
    }

    numberValue =
      numberValue >= MIN_VALID_INTERVAL_SECONDS
        ? numberValue
        : MIN_VALID_INTERVAL_SECONDS;

    setSlideshowDelay(numberValue);

    if (slideshowInterval !== null) {
      setSlideshowInterval(numberValue * SECONDS_TO_MS);
    }
  };

  const currentIndex = index === null ? initialIndex : index;

  function gotoPage(imageIndex: number) {
    const indexInPage = (imageIndex - 1) % pageSize;
    if (pageCallback) {
      let jumppage = Math.floor((imageIndex - 1) / pageSize) + 1;
      if (page !== jumppage) {
        pageCallback({ page: jumppage });
        oldImages.current = images;
        setIsSwitchingPage(true);
        pageChangeCountRef.current += 1;
      }
    }

    setIndex(indexInPage);
    setShowChapters(false);
  }

  function chapterHeader() {
    const imageNumber = (index ?? 0) + 1;
    const globalIndex = page
      ? (page - 1) * pageSize + imageNumber
      : imageNumber;

    let chapterTitle = "";
    chapters.forEach(function (chapter) {
      if (chapter.image_index > globalIndex) {
        return;
      }
      chapterTitle = chapter.title;
    });

    return chapterTitle ?? "";
  }

  const renderChapterMenu = () => {
    if (chapters.length <= 0) return;

    const popoverContent = chapters.map(({ id, title, image_index }) => (
      <Dropdown.Item key={id} onClick={() => gotoPage(image_index)}>
        {" "}
        {title}
        {title.length > 0 ? " - #" : "#"}
        {image_index}
      </Dropdown.Item>
    ));

    return (
      <Dropdown
        show={showChapters}
        onToggle={() => setShowChapters(!showChapters)}
      >
        <Dropdown.Toggle className={`minimal ${CLASSNAME_CHAPTER_BUTTON}`}>
          <Icon icon={showChapters ? faTimes : faBars} />
        </Dropdown.Toggle>
        <Dropdown.Menu className={`${CLASSNAME_CHAPTERS}`}>
          {popoverContent}
        </Dropdown.Menu>
      </Dropdown>
    );
  };

  // #2451: making OptionsForm an inline component means it
  // get re-rendered each time. This makes the text
  // field lose focus on input. Use function instead.
  function renderOptionsForm() {
    return (
      <>
        {slideshowEnabled ? (
          <Form.Group controlId="delay" as={Row} className="form-container">
            <Col xs={4}>
              <Form.Label className="col-form-label">
                <FormattedMessage id="dialogs.lightbox.delay" />
              </Form.Label>
            </Col>
            <Col xs={8}>
              <Form.Control
                type="number"
                className="text-input"
                min={1}
                value={displayedSlideshowInterval ?? 0}
                onChange={onDelayChange}
                size="sm"
              />
            </Col>
          </Form.Group>
        ) : undefined}

        <Form.Group controlId="displayMode" as={Row}>
          <Col xs={4}>
            <Form.Label className="col-form-label">
              <FormattedMessage id="dialogs.lightbox.display_mode.label" />
            </Form.Label>
          </Col>
          <Col xs={8}>
            <Form.Control
              as="select"
              onChange={(e) =>
                setDisplayMode(e.target.value as GQL.ImageLightboxDisplayMode)
              }
              value={displayMode}
              className="btn-secondary mx-1 mb-1"
            >
              {Array.from(imageLightboxDisplayModeIntlMap.entries()).map(
                (v) => (
                  <option key={v[0]} value={v[0]}>
                    {intl.formatMessage({
                      id: v[1],
                    })}
                  </option>
                )
              )}
            </Form.Control>
          </Col>
        </Form.Group>
        <Form.Group>
          <Form.Group controlId="scaleUp" as={Row} className="mb-1">
            <Col>
              <Form.Check
                type="checkbox"
                label={intl.formatMessage({
                  id: "dialogs.lightbox.scale_up.label",
                })}
                checked={scaleUp}
                disabled={displayMode === GQL.ImageLightboxDisplayMode.Original}
                onChange={(v) => setScaleUp(v.currentTarget.checked)}
              />
            </Col>
          </Form.Group>
          <Form.Text className="text-muted">
            {intl.formatMessage({
              id: "dialogs.lightbox.scale_up.description",
            })}
          </Form.Text>
        </Form.Group>
        <Form.Group>
          <Form.Group controlId="resetZoomOnNav" as={Row} className="mb-1">
            <Col>
              <Form.Check
                type="checkbox"
                label={intl.formatMessage({
                  id: "dialogs.lightbox.reset_zoom_on_nav",
                })}
                checked={resetZoomOnNav}
                onChange={(v) => setResetZoomOnNav(v.currentTarget.checked)}
              />
            </Col>
          </Form.Group>
        </Form.Group>
        <Form.Group controlId="scrollMode">
          <Form.Group as={Row} className="mb-1">
            <Col xs={4}>
              <Form.Label className="col-form-label">
                <FormattedMessage id="dialogs.lightbox.scroll_mode.label" />
              </Form.Label>
            </Col>
            <Col xs={8}>
              <Form.Control
                as="select"
                onChange={(e) =>
                  setScrollMode(e.target.value as GQL.ImageLightboxScrollMode)
                }
                value={scrollMode}
                className="btn-secondary mx-1 mb-1"
              >
                <option
                  value={GQL.ImageLightboxScrollMode.Zoom}
                  key={GQL.ImageLightboxScrollMode.Zoom}
                >
                  {intl.formatMessage({
                    id: "dialogs.lightbox.scroll_mode.zoom",
                  })}
                </option>
                <option
                  value={GQL.ImageLightboxScrollMode.PanY}
                  key={GQL.ImageLightboxScrollMode.PanY}
                >
                  {intl.formatMessage({
                    id: "dialogs.lightbox.scroll_mode.pan_y",
                  })}
                </option>
              </Form.Control>
            </Col>
          </Form.Group>
          <Form.Text className="text-muted">
            {intl.formatMessage({
              id: "dialogs.lightbox.scroll_mode.description",
            })}
          </Form.Text>
        </Form.Group>
      </>
    );
  }

  function renderBody() {
    if (images.length === 0 || isLoading || isSwitchingPage) {
      return <LoadingIndicator />;
    }

    const currentImage: ILightboxImage | undefined = images[currentIndex];
    const title = currentImage ? imageTitle(currentImage) : undefined;

    function setRating(v: number | null) {
      if (currentImage?.id) {
        updateImage({
          variables: {
            input: {
              id: currentImage.id,
              rating100: v,
            },
          },
        });
      }
    }

    async function onIncrementClick() {
      if (currentImage?.id === undefined) return;
      try {
        await mutateImageIncrementO(currentImage.id);
      } catch (e) {
        Toast.error(e);
      }
    }

    async function onDecrementClick() {
      if (currentImage?.id === undefined) return;
      try {
        await mutateImageDecrementO(currentImage.id);
      } catch (e) {
        Toast.error(e);
      }
    }

    async function onResetClick() {
      if (currentImage?.id === undefined) return;
      try {
        await mutateImageResetO(currentImage?.id);
      } catch (e) {
        Toast.error(e);
      }
    }

    const pageHeader =
      page && pages
        ? intl.formatMessage(
            { id: "dialogs.lightbox.page_header" },
            { page, total: pages }
          )
        : "";

    return (
      <>
        <div className={CLASSNAME_HEADER}>
          {chapters.length > 0 && (
            <div className={CLASSNAME_LEFT_SPACER}>{renderChapterMenu()}</div>
          )}
          <div className={CLASSNAME_INDICATOR}>
            <span>
              {chapterHeader()} {pageHeader}
            </span>
            {images.length > 1 ? (
              <b ref={indicatorRef}>{`${currentIndex + 1} / ${
                images.length
              }`}</b>
            ) : undefined}
          </div>
          <div className={CLASSNAME_RIGHT}>
            <div className={CLASSNAME_OPTIONS}>
              <div className={CLASSNAME_OPTIONS_ICON}>
                <Button
                  ref={overlayTarget}
                  variant="link"
                  title={intl.formatMessage({
                    id: "dialogs.lightbox.options",
                  })}
                  onClick={() => setShowOptions(!showOptions)}
                >
                  <Icon icon={faCog} />
                </Button>
                <Overlay
                  target={overlayTarget.current}
                  show={showOptions}
                  placement="bottom"
                  container={containerRef}
                  rootClose
                  onHide={() => setShowOptions(false)}
                >
                  {({ placement, arrowProps, show: _show, ...props }) => (
                    <div
                      className="popover"
                      {...props}
                      style={{ ...props.style }}
                    >
                      <Popover.Title>
                        {intl.formatMessage({
                          id: "dialogs.lightbox.options",
                        })}
                      </Popover.Title>
                      <Popover.Content>{renderOptionsForm()}</Popover.Content>
                    </div>
                  )}
                </Overlay>
              </div>
              <InputGroup className={CLASSNAME_OPTIONS_INLINE}>
                {renderOptionsForm()}
              </InputGroup>
            </div>
            {slideshowEnabled && (
              <Button
                variant="link"
                onClick={toggleSlideshow}
                title="Toggle Slideshow"
              >
                <Icon icon={slideshowInterval !== null ? faPause : faPlay} />
              </Button>
            )}

            {document.fullscreenEnabled && (
              <Button
                variant="link"
                onClick={toggleFullscreen}
                title="Toggle Fullscreen"
              >
                <Icon icon={faExpand} />
              </Button>
            )}
            <Button
              variant="link"
              onClick={() => close()}
              title="Close Lightbox"
            >
              <Icon icon={faTimes} />
            </Button>
          </div>
        </div>
        <div className={CLASSNAME_DISPLAY}>
          {allowNavigation && (
            <Button
              variant="link"
              onClick={handleLeft}
              className={`${CLASSNAME_NAVBUTTON} d-none d-lg-block`}
            >
              <Icon icon={faChevronLeft} />
            </Button>
          )}

          {/* PhotoSwipe handles the rendering of images and videos via the dynamic pswp container */}

          {allowNavigation && (
            <Button
              variant="link"
              onClick={handleRight}
              className={`${CLASSNAME_NAVBUTTON} d-none d-lg-block`}
            >
              <Icon icon={faChevronRight} />
            </Button>
          )}
        </div>
        {showNavigation && !isFullscreen && images.length > 1 && (
          <div className={CLASSNAME_NAV} style={navOffset} ref={navRef}>
            <Button
              variant="link"
              onClick={() => setIndex(images.length - 1)}
              className={CLASSNAME_NAVBUTTON}
            >
              <Icon icon={faArrowLeft} className="mr-4" />
            </Button>
            {navItems}
            <Button
              variant="link"
              onClick={() => setIndex(0)}
              className={CLASSNAME_NAVBUTTON}
            >
              <Icon icon={faArrowRight} className="ml-4" />
            </Button>
          </div>
        )}
        <div className={CLASSNAME_FOOTER}>
          <div className={CLASSNAME_FOOTER_LEFT}>
            {currentImage?.id !== undefined && (
              <>
                <div>
                  <OCounterButton
                    onDecrement={onDecrementClick}
                    onIncrement={onIncrementClick}
                    onReset={onResetClick}
                    value={currentImage?.o_counter ?? 0}
                  />
                </div>
                <RatingSystem
                  value={currentImage?.rating100}
                  onSetRating={(v) => setRating(v)}
                  clickToRate
                  withoutContext
                />
              </>
            )}
          </div>
          <div className={CLASSNAME_FOOTER_CENTER}>
            {currentImage && (
              <>
                <Link
                  className="image-link"
                  to={`/images/${currentImage.id}`}
                  onClick={() => close(true)}
                >
                  {title ?? ""}
                </Link>
                {currentImage.galleries?.length ? (
                  <Link
                    className="image-gallery-link"
                    to={`/galleries/${currentImage.galleries[0].id}`}
                    onClick={() => close(true)}
                  >
                    <Icon icon={faImages} />
                    {galleryTitle(currentImage.galleries[0])}
                  </Link>
                ) : null}
              </>
            )}
          </div>
          <div className={CLASSNAME_FOOTER_RIGHT}></div>
        </div>
      </>
    );
  }

  if (!isVisible) {
    return <></>;
  }

  return (
    <div
      className={cx(CLASSNAME, { "hide-controls": !showControls })}
      role="presentation"
      ref={containerRef}
      onClick={handleClose}
    >
      {renderBody()}
    </div>
  );
};

export default LightboxComponent;
