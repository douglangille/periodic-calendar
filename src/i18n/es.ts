import type en from './en';

/**
 * Spanish strings.
 *
 * Typed against `en`, so adding a key there without translating it here is a
 * compile error. Sentence case applies in Spanish too, which is also the
 * language's own convention.
 */
const es: Record<keyof typeof en, string> = {
	// --- Vista y navegación --------------------------------------------------
	viewTitle: 'Calendario',
	ribbonOpenCalendar: 'Abrir el calendario',
	navPreviousMonth: 'Mes anterior',
	navNextMonth: 'Mes siguiente',
	navToday: 'Ir a hoy',
	gridWeekColumn: 'Semana',
	headerOpenPeriod: 'Abrir {period}',
	periodWeekLabel: 'Semana {week} · {year}',

	// --- Comandos ------------------------------------------------------------
	commandOpenView: 'Abrir la vista',
	commandRevealActiveNote: 'Mostrar la nota activa',
	commandOpenDailyNote: 'Abrir la nota diaria',
	commandOpenWeeklyNote: 'Abrir la nota semanal',
	commandOpenMonthlyNote: 'Abrir la nota mensual',
	commandOpenQuarterlyNote: 'Abrir la nota trimestral',
	commandOpenSemesterNote: 'Abrir la nota semestral',
	commandOpenYearlyNote: 'Abrir la nota anual',

	// --- Menú contextual -----------------------------------------------------
	menuOpenInNewTab: 'Abrir en una pestaña nueva',
	menuOpenToTheRight: 'Abrir a la derecha',
	menuDelete: 'Eliminar',
	menuCreateNote: 'Crear la nota',
	menuNotConfigured: 'Este periodo no tiene ninguna nota configurada',

	// --- Avisos y el modal de confirmación -----------------------------------
	noticeNotPeriodicNote: 'La nota activa no es una nota periódica.',
	noticeNotConfigured:
		'Este periodo no tiene ninguna nota configurada. Configúralo en Periodic Notes, o en los ajustes de Periodic Calendar para las notas semestrales.',
	noticeTemplateUnreadable: 'No se pudo leer la plantilla {path}',
	noticeCreateFailed: 'No se pudo crear la nota.',
	modalNewNoteTitle: 'Nota nueva',
	modalNewNoteBody: 'El archivo {name} no existe. ¿Quieres crearlo?',
	modalCreate: 'Crear',
	modalCancel: 'Ahora no',

	// --- Ajustes: encabezados de grupo ---------------------------------------
	settingsGroupWeek: 'Semana',
	settingsGroupNotes: 'Notas',
	settingsGroupSources: 'Fuentes',
	settingsGroupFooter: 'Pie de resumen',
	settingsGroupSemester: 'Notas semestrales',

	// --- Ajustes: elementos --------------------------------------------------
	settingWeekStartName: 'Empezar la semana en',
	settingWeekStartDesc:
		'Con qué día empieza la rejilla. El predeterminado del idioma sigue al idioma del calendario.',
	settingLocaleName: 'Cambiar el idioma',
	settingLocaleDesc: 'Mostrar el calendario en un idioma distinto al de Obsidian.',
	settingWeekNumbersName: 'Mostrar los números de semana',
	settingWeekNumbersDesc: 'Añade una columna con el número de semana, que abre la nota semanal.',
	settingConfirmName: 'Confirmar antes de crear una nota',
	settingConfirmDesc: 'Preguntar antes de que un clic cree una nota que todavía no existe.',
	settingShortcutsName: 'Mostrar los atajos de periodo',
	settingShortcutsDesc:
		'Una fila de botones bajo la cabecera que abre las notas anual, semestral, trimestral y mensual.',
	settingValueDisplayName: 'Valores de las fuentes',
	settingValueDisplayDesc:
		'Cómo se dibuja la magnitud que una fuente aporta a un periodo: como intensidad de fondo, que convierte el mes en un mapa de calor, o como número dentro de la celda. Oculto la descarta del todo, así que una fuente cuya única aportación es un número se vuelve invisible.',
	settingHoverName: 'Al pasar el ratón por un día',
	settingHoverDesc:
		'El resumen de la celda es un mensaje con lo que las fuentes aportan a ese día. La vista previa es la ventana emergente que Obsidian muestra para un enlace, y sustituye al resumen en vez de sumarse a él.',
	settingWordsPerDotName: 'Palabras por punto',
	settingWordsPerDotDesc:
		'Cuántas palabras representa cada punto de la fuente de recuento de palabras.',
	settingsSourcesEmpty:
		'Todavía no hay ninguna fuente registrada. Las fuentes vienen del propio Periodic Calendar y de otros plugins.',
	settingsSourceDegraded:
		'Detenida tras varios errores seguidos. Se reintenta cuando informe de datos nuevos.',
	settingFooterName: 'Mostrar el pie de resumen',
	settingFooterDesc:
		'Una tira de tarjetas bajo la rejilla con las cifras que aportan las fuentes activas para el mes en pantalla.',
	settingMaxCardsName: 'Máximo de tarjetas',
	settingMaxCardsDesc:
		'Las tarjetas que pasen de esta cantidad no se muestran, para que el pie no se coma una barra lateral estrecha.',
	settingSemesterEnabledName: 'Activar las notas semestrales',
	settingSemesterEnabledDesc:
		'Periodic Notes no tiene nivel semestral, así que Periodic Calendar lo resuelve por su cuenta: el semestre 1 abarca los primeros seis meses del año, y el 2 el resto.',
	settingSemesterFolderName: 'Carpeta de las notas semestrales',
	settingSemesterFolderPlaceholder: 'Carpeta para las notas semestrales',
	settingSemesterFormatName: 'Formato de las notas semestrales',
	settingSemesterFormatDesc:
		'Un formato de moment. El token adicional {token} se convierte en 1 o 2. Predeterminado: {default}',
	settingSemesterTemplateName: 'Plantilla de las notas semestrales',

	// --- Ajustes: opciones de los desplegables -------------------------------
	optionLocaleDefault: 'Predeterminado del idioma',
	optionSameAsObsidian: 'El mismo que Obsidian',
	optionValueHidden: 'Oculto',
	optionValueNumber: 'Como número',
	optionValueIntensity: 'Como intensidad de fondo',
	optionHoverPreview: 'La vista previa de la nota',
	optionHoverSummary: 'El resumen de la celda',
	optionHoverNone: 'Nada',

	// --- Fuentes integradas --------------------------------------------------
	sourceNotesExistName: 'Notas existentes',
	sourceWordCountName: 'Recuento de palabras',
	sourceTagsName: 'Etiquetas',
	sourceWordCountTooltipOne: '{count} palabra',
	sourceWordCountTooltip: '{count} palabras',

	// --- Fuentes integradas: tarjetas del pie --------------------------------
	summaryNotesLabel: 'Notas',
	summaryNotesTooltip: '{count} de los {days} días del periodo tienen nota',
	summaryWordsLabel: 'Palabras',
	summaryWordsTooltip: '{count} palabras en las notas del periodo',
	summaryTagsLabel: 'Etiquetas',
	summaryTagsTooltip: '{count} etiquetas distintas en las notas del periodo',
};

export default es;
