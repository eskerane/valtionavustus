(ns oph.form.schema
  (:require [schema.core :as s]))

(s/defschema LocalizedString {:fi s/Str
                              :sv s/Str})

(s/defschema Option {:value s/Str
                     (s/optional-key :label) LocalizedString})

(s/defschema InfoElement {:type (s/eq "infoElement")
                          :id s/Str
                          :displayAs (s/enum :h1
                                             :bulletList
                                             :dateRange
                                             :endOfDateRange)
                          (s/optional-key :params) s/Any
                          (s/optional-key :label) LocalizedString})

(s/defschema FormField {:type (s/eq "formField")
                        :id s/Str
                        :required s/Bool
                        :label LocalizedString
                        (s/optional-key :params) s/Any
                        (s/optional-key :options) [Option]
                        :displayAs (s/enum :textField
                                           :textArea
                                           :emailField
                                           :dropdown
                                           :radioButton)})

(s/defschema BasicElement (s/either FormField
                                    InfoElement))

(s/defschema WrapperElement {:type (s/eq "wrapperElement")
                             :id s/Str
                             :displayAs (s/enum :theme
                                                :fieldset)
                             :children  [(s/either BasicElement
                                                   (s/recursive #'WrapperElement))]
                             (s/optional-key :params) s/Any
                             (s/optional-key :label) LocalizedString})

(s/defschema Content [(s/either BasicElement
                                WrapperElement)])

(s/defschema Form {:id Long,
                   :content Content,
                   :start s/Inst})

(s/defschema Answers
  "Answers consists of a flat field id to value mapping"
  {s/Keyword s/Str})

(s/defschema Submission {:id Long
                         :submittime s/Inst
                         :form Long
                         :version Long
                         :version_closed (s/maybe s/Inst)
                         :answers Answers})

(s/defschema SubmissionValidationErrors
  "Submission validation errors contain a mapping from field id to list of validation errors"
  {s/Keyword [s/Str]})