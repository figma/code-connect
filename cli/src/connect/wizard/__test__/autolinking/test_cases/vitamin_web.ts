import { AutolinkingTestCase } from '../types'

const vitaminWeb: AutolinkingTestCase = {
  name: 'Vitamin - web',
  passThreshold: 0.85, // remaining failures due to non-matching names (more context required)
  figmaComponents: [
    {
      name: '_Utitlies/Header',
      id: '10848:26165',
    },
    {
      name: '_Utilities/Slot',
      id: '7343:17922',
    },
    {
      name: 'Inline link/Large/Off/Focus',
      id: '1576:92',
    },
    {
      name: '_Inline link/Medium/Off/Focus',
      id: '1576:81',
    },
    {
      name: '_Inline link/Small/Off/Focus',
      id: '1576:7',
    },
    {
      name: '_Standalone link/Large/Off/Off/Focus',
      id: '1207:8990',
    },
    {
      name: '_Standalone link/Medium/Off/Off/Focus',
      id: '1207:8980',
    },
    {
      name: '_Standalone link/Large/Off/On/Focus',
      id: '1207:8966',
    },
    {
      name: '_Standalone link/Medium/Off/On/Focus',
      id: '1207:8945',
    },
    {
      name: '_Standalone link/Small/Off/On/Focus',
      id: '1207:8924',
    },
    {
      name: '_Standalone link/Small/Off/Off/Focus',
      id: '1207:8907',
    },
    {
      name: '_Button/Primary/Large/False/No icon/Focus',
      id: '72:2317',
    },
    {
      name: 'Accordion',
      id: '8029:29057',
    },
    {
      name: '_Accordion utilities/Item',
      id: '8029:28243',
    },
    {
      name: 'Card',
      id: '4398:11429',
    },
    {
      name: '_Card utilities/Media top',
      id: '4398:11469',
    },
    {
      name: '_Card utilities/Media full',
      id: '4398:11462',
    },
    {
      name: '_Card utilities/Container',
      id: '4818:10883',
    },
    {
      name: '_Card utilities/Actions',
      id: '4398:11420',
    },
    {
      name: '_Card utilities/Thumbnail',
      id: '4398:11411',
    },
    {
      name: '_Card utilities/Title + description',
      id: '4398:11408',
    },
    {
      name: '_Card utilities/Additional informations',
      id: '4398:11395',
    },
    {
      name: '_Card utilities/Aspect ratio',
      id: '4398:11466',
    },
    {
      name: 'Divider',
      id: '6871:13107',
    },
    {
      name: 'List',
      id: '9202:20731',
    },
    {
      name: '_List utilities/List item separator',
      id: '9202:20777',
    },
    {
      name: '_List utilities/List Item Content',
      id: '9194:18894',
    },
    {
      name: '_List utilities/List item',
      id: '9194:18713',
    },
    {
      name: '_List utilities/Enhancing elements/Slot',
      id: '9194:18752',
    },
    {
      name: '_List utilities/Enhancing elements/Action',
      id: '9194:18753',
    },
    {
      name: '_List utilities/Generic content placeholder',
      id: '9194:18706',
    },
    {
      name: '_List utilities/Media',
      id: '6936:16763',
    },
    {
      name: '_List utilities/Action',
      id: '6936:16357',
    },
    {
      name: 'Skeleton',
      id: '3451:10738',
    },
    {
      name: 'Checkbox',
      id: '783:9869',
    },
    {
      name: 'Chip',
      id: '4652:11424',
    },
    {
      name: '_Chip utilities/Medium',
      id: '4672:14662',
    },
    {
      name: '_Chip utilities/Small',
      id: '4594:10821',
    },
    {
      name: 'Quantity',
      id: '6937:16423',
    },
    {
      name: '_Quantity utilities/Button',
      id: '6937:16719',
    },
    {
      name: '_Quantity utilities/Input',
      id: '6937:16698',
    },
    {
      name: 'Radio',
      id: '359:30',
    },
    {
      name: 'Toggle',
      id: '612:1192',
    },
    {
      name: 'Alert',
      id: '2983:15032',
    },
    {
      name: 'Modal',
      id: '2993:12130',
    },
    {
      name: 'Popover',
      id: '2756:10788',
    },
    {
      name: '_Popover utilities/Base',
      id: '2756:10785',
    },
    {
      name: 'Snackbar',
      id: '2796:12600',
    },
    {
      name: 'Toast',
      id: '2790:10831',
    },
    {
      name: 'Tooltip',
      id: '11099:29077',
    },
    {
      name: '_Tooltip utilities/Base',
      id: '2756:10783',
    },
    {
      name: '_Breadcrumb utilities/More',
      id: '6170:13071',
    },
    {
      name: '_Breadcrumb utilities/End',
      id: '6170:13073',
    },
    {
      name: '_Breadcrumb utilities/Middle',
      id: '6170:13072',
    },
    {
      name: '_Breadcrumb utilities/Start',
      id: '6170:12987',
    },
    {
      name: 'Breadcrumb',
      id: '6063:13272',
    },
    {
      name: 'Navbar',
      id: '10847:27832',
    },
    {
      name: '_Search utilities/Search button',
      id: '6527:13865',
    },
    {
      name: '_Search utilities/Clear button',
      id: '6529:14096',
    },
    {
      name: '_Search utilities/Icon button',
      id: '6529:15053',
    },
    {
      name: 'Search',
      id: '6527:15021',
    },
    {
      name: '_Tabs utilities/List',
      id: '6840:13207',
    },
    {
      name: '_Tabs utilities/Variants',
      id: '6840:13140',
    },
    {
      name: '_Tabs utilities/States',
      id: '6840:13272',
    },
    {
      name: 'Tabs',
      id: '6840:14866',
    },
    {
      name: '_Rating utilities/Star',
      id: '2573:9367',
    },
    {
      name: 'Rating - Read only',
      id: '2573:9424',
    },
    {
      name: 'Rating - Interactive',
      id: '2802:10337',
    },
    {
      name: 'Progressbar (Linear)',
      id: '2887:11057',
    },
    {
      name: 'Progressbar (Circular)',
      id: '3010:11433',
    },
    {
      name: 'Tag',
      id: '7492:18228',
    },
    {
      name: 'Price',
      id: '7639:18237',
    },
    {
      name: 'Loader',
      id: '3014:11530',
    },
    {
      name: 'Badge',
      id: '2603:9428',
    },
    {
      name: 'Select',
      id: '2535:52',
    },
    {
      name: 'Text area',
      id: '151:5704',
    },
    {
      name: 'Text input',
      id: '150:4893',
    },
    {
      name: 'Link',
      id: '1207:8900',
    },
    {
      name: 'Button',
      id: '1866:31',
    },
    {
      name: '_button construction/Small icon alone',
      id: '12688:30430',
    },
    {
      name: '_button construction/Medium icon alone',
      id: '12688:30431',
    },
    {
      name: '_button construction/Large icon alone',
      id: '12688:30432',
    },
    {
      name: '_button construction/Small text+icons',
      id: '69:20',
    },
    {
      name: '_button construction/Medium text+icons',
      id: '67:596',
    },
    {
      name: '_button construction/Large text+icons',
      id: '67:59',
    },
    {
      name: 'Dropdown',
      id: '2421:3',
    },
    {
      name: 'Dropdown menu item',
      id: '3152:12884',
    },
    {
      name: 'Dropdown menu',
      id: '3152:13063',
    },
    {
      name: 'Spacer',
      id: '1175:8966',
    },
    {
      name: '_ Contribution Companion',
      id: '12748:30571',
    },
    {
      name: '_ FileEditorRow',
      id: '12748:30561',
    },
    {
      name: '_ EditorAvatar',
      id: '12748:30558',
    },
    {
      name: '_ ContributionCeckbox',
      id: '12748:30552',
    },
    {
      name: '_Cover',
      id: '39:33',
    },
  ],
  filepathExports: [
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnSkeleton/VtmnSkeleton.tsx~VtmnSkeletonProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnSkeleton/VtmnSkeleton.tsx~VtmnSkeleton',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnSkeleton/VtmnSkeleton.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnList/VtmnList.tsx~VtmnListItemStartVisual',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnList/VtmnList.tsx~VtmnListItemText',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnList/VtmnList.tsx~VtmnListItemEndAction',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnList/VtmnList.tsx~VtmnListItemLink',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnList/VtmnList.tsx~VtmnListItemProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnList/VtmnList.tsx~VtmnListItem',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnList/VtmnList.tsx~VtmnListProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnList/VtmnList.tsx~VtmnList',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnList/VtmnList.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnDivider/VtmnDivider.tsx~VtmnDividerProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnDivider/VtmnDivider.tsx~VtmnDivider',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnDivider/VtmnDivider.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnCard/VtmnCard.tsx~VtmnCardProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnCard/VtmnCard.tsx~VtmnCard',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnCard/VtmnCard.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnAccordion/VtmnAccordion.tsx~VtmnAccordionProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnAccordion/VtmnAccordion.tsx~VtmnAccordion',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnAccordion/VtmnAccordion.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnToggle/VtmnToggle.tsx~VtmnToggleProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnToggle/VtmnToggle.tsx~VtmnToggle',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnToggle/VtmnToggle.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnRadioButton/VtmnRadioButton.tsx~VtmnRadioButtonProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnRadioButton/VtmnRadioButton.tsx~VtmnRadioButton',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnRadioButton/VtmnRadioButton.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnQuantity/VtmnQuantity.tsx~VtmnQuantityProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnQuantity/VtmnQuantity.tsx~VtmnQuantity',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnQuantity/VtmnQuantity.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnChip/VtmnChip.tsx~VtmnChipProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnChip/VtmnChip.tsx~VtmnChip',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnChip/VtmnChip.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnCheckbox/VtmnCheckbox.tsx~VtmnCheckboxProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnCheckbox/VtmnCheckbox.tsx~VtmnCheckbox',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnCheckbox/VtmnCheckbox.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnTooltip/VtmnTooltip.tsx~VtmnTooltipProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnTooltip/VtmnTooltip.tsx~VtmnTooltip',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnTooltip/VtmnTooltip.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnToast/VtmnToast.tsx~VtmnToastProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnToast/VtmnToast.tsx~VtmnToast',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnToast/VtmnToast.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnSnackbar/VtmnSnackbar.tsx~VtmnSnackbarProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnSnackbar/VtmnSnackbar.tsx~VtmnSnackbar',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnSnackbar/VtmnSnackbar.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnPopover/VtmnPopover.tsx~VtmnPopoverProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnPopover/VtmnPopover.tsx~VtmnPopover',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnPopover/VtmnPopover.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnModal/VtmnModal.tsx~VtmnModalProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnModal/VtmnModal.tsx~VtmnModal',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnModal/VtmnModal.tsx~VtmnModalTitleProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnModal/VtmnModal.tsx~VtmnModalTitle',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnModal/VtmnModal.tsx~VtmnModalDescription',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnModal/VtmnModal.tsx~VtmnModalActions',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnModal/VtmnModal.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnAlert/VtmnAlert.tsx~VtmnAlertProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnAlert/VtmnAlert.tsx~VtmnAlert',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnAlert/VtmnAlert.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnTabs/VtmnTabsItem.tsx~VtmnTabsItemProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnTabs/VtmnTabsItem.tsx~VtmnTabsItem',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnTabs/VtmnTabsItem.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnTabs/VtmnTabs.tsx~VtmnTabsProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnTabs/VtmnTabs.tsx~VtmnTabs',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnTabs/VtmnTabs.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnSearch/VtmnSearch.tsx~VtmnSearchProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnSearch/VtmnSearch.tsx~VtmnSearch',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnSearch/VtmnSearch.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnNavbarLink/VtmnNavbarLink.tsx~VtmnNavbarLinkProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnNavbarLink/VtmnNavbarLink.tsx~VtmnNavbarLink',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnNavbarLink/VtmnNavbarLink.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnNavbar/VtmnNavbar.tsx~VtmnNavbarProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnNavbar/VtmnNavbar.tsx~VtmnNavbar',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnNavbar/VtmnNavbar.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnBreadcrumb/VtmnBreadcrumbItem.tsx~VtmnBreadcrumbItemProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnBreadcrumb/VtmnBreadcrumbItem.tsx~VtmnBreadcrumbItem',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnBreadcrumb/VtmnBreadcrumbItem.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnBreadcrumb/VtmnBreadcrumb.tsx~VtmnBreadcrumbProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnBreadcrumb/VtmnBreadcrumb.tsx~VtmnBreadcrumb',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnBreadcrumb/VtmnBreadcrumb.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnTag/VtmnTag.tsx~VtmnTagProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnTag/VtmnTag.tsx~VtmnTag',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnTag/VtmnTag.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnRating/VtmnRating.tsx~VtmnRatingProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnRating/VtmnRating.tsx~VtmnRating',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnRating/VtmnRating.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnProgressbar/VtmnProgressbar.tsx~VtmnProgressbarProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnProgressbar/VtmnProgressbar.tsx~VtmnProgressbar',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnProgressbar/VtmnProgressbar.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnPrice/VtmnPrice.tsx~VtmnPriceProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnPrice/VtmnPrice.tsx~VtmnPrice',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnPrice/VtmnPrice.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnLoader/VtmnLoader.tsx~VtmnLoaderProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnLoader/VtmnLoader.tsx~VtmnLoader',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnLoader/VtmnLoader.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnBadge/VtmnBadge.tsx~VtmnBadgeProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnBadge/VtmnBadge.tsx~VtmnBadge',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnBadge/VtmnBadge.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/forms/VtmnTextInput/VtmnTextInput.tsx~VtmnTextInputProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/forms/VtmnTextInput/VtmnTextInput.tsx~VtmnTextInput',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/forms/VtmnTextInput/VtmnTextInput.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/forms/VtmnSelect/VtmnSelect.tsx~VtmnSelectProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/forms/VtmnSelect/VtmnSelect.tsx~VtmnSelect',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/forms/VtmnSelect/VtmnSelect.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnLink/VtmnLink.tsx~VtmnLinkProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnLink/VtmnLink.tsx~VtmnLink',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnLink/VtmnLink.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnDropdown/VtmnDropdownItem.tsx~VtmnDropdownItemProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnDropdown/VtmnDropdownItem.tsx~VtmnDropdownItem',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnDropdown/VtmnDropdownItem.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnDropdown/VtmnDropdown.tsx~VtmnDropdownProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnDropdown/VtmnDropdown.tsx~VtmnDropdown',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnDropdown/VtmnDropdown.tsx~default',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnButton/VtmnButton.tsx~VtmnButtonProps',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnButton/VtmnButton.tsx~VtmnButton',
    '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnButton/VtmnButton.tsx~default',
  ],
  perfectResult: {
    // simple matches
    '3451:10738' /* Skeleton */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnSkeleton/VtmnSkeleton.tsx~default',
    '9202:20731' /* List */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnList/VtmnList.tsx~default',
    '6871:13107' /* Divider */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnDivider/VtmnDivider.tsx~default',
    '4398:11429' /* Card */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnCard/VtmnCard.tsx~default',
    '8029:29057' /* Accordion */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/structure/VtmnAccordion/VtmnAccordion.tsx~default',
    '612:1192' /* Toggle */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnToggle/VtmnToggle.tsx~default',
    '6937:16423' /* Quantity */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnQuantity/VtmnQuantity.tsx~default',
    '4652:11424' /* Chip */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnChip/VtmnChip.tsx~default',
    '783:9869' /* Checkbox */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnCheckbox/VtmnCheckbox.tsx~default',
    '11099:29077' /* Tooltip */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnTooltip/VtmnTooltip.tsx~default',
    '2790:10831' /* Toast */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnToast/VtmnToast.tsx~default',
    '2796:12600' /* Snackbar */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnSnackbar/VtmnSnackbar.tsx~default',
    '2756:10788' /* Popover */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnPopover/VtmnPopover.tsx~default',
    '2993:12130' /* Modal */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnModal/VtmnModal.tsx~default',
    '2983:15032' /* Alert */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/overlays/VtmnAlert/VtmnAlert.tsx~default',
    '6840:14866' /* Tabs */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnTabs/VtmnTabs.tsx~default',
    '6527:15021' /* Search */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnSearch/VtmnSearch.tsx~default',
    '10847:27832' /* Navbar */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnNavbar/VtmnNavbar.tsx~default',
    '6063:13272' /* Breadcrumb */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/navigation/VtmnBreadcrumb/VtmnBreadcrumb.tsx~default',
    '7492:18228' /* Tag */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnTag/VtmnTag.tsx~default',
    '7639:18237' /* Price */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnPrice/VtmnPrice.tsx~default',
    '3014:11530' /* Loader */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnLoader/VtmnLoader.tsx~default',
    '2603:9428' /* Badge */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnBadge/VtmnBadge.tsx~default',
    '150:4893' /* Text input */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/forms/VtmnTextInput/VtmnTextInput.tsx~default',
    '2535:52' /* Select */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/forms/VtmnSelect/VtmnSelect.tsx~default',
    '1207:8900' /* Link */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnLink/VtmnLink.tsx~default',
    '2421:3' /* Dropdown */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnDropdown/VtmnDropdown.tsx~default',
    '1866:31' /* Button */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnButton/VtmnButton.tsx~default',

    // name not an exact match
    '359:30' /* Radio */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/selection-controls/VtmnRadioButton/VtmnRadioButton.tsx~default',
    '3152:12884' /* Dropdown menu item */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/actions/VtmnDropdown/VtmnDropdownItem.tsx~default',

    // same code definition handles multiple components
    '2573:9424' /* Rating - Read only */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnRating/VtmnRating.tsx~default',
    '2802:10337' /* Rating - Interactive */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnRating/VtmnRating.tsx~default',
    '2887:11057' /* Progressbar (Linear) */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnProgressbar/VtmnProgressbar.tsx~default',
    '3010:11433' /* Progressbar (Circular) */:
      '/Users/foo/vitamin-web/packages/sources/react/src/components/indicators/VtmnProgressbar/VtmnProgressbar.tsx~default',
  },
}

export default vitaminWeb
