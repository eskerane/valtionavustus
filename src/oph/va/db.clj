(ns oph.va.db
  (:use [oph.va.config :only [config]])
  (:require [clojure.java.jdbc :as jdbc]
            [hikari-cp.core :refer :all]
            [oph.va.db.queries :as queries]
            [oph.va.jdbc.jsonb]))

(def datasource-spec
  "Merge configuration defaults and db config. Latter overrides the defaults"
  (merge {:auto-commit false
          :read-only false
          :connection-timeout 30000
          :validation-timeout 5000
          :idle-timeout 600000
          :max-lifetime 1800000
          :minimum-idle 10
          :maximum-pool-size 10
          :pool-name "db-pool"
          :adapter "postgresql"}
         (:db config)))

(def datasource (delay (make-datasource datasource-spec)))

(defmacro exec [query params]
  `(jdbc/with-db-transaction [connection# {:datasource @datasource}]
     (~query ~params {:connection connection#})))

(defn clear-db! []
  (if (:allow-db-clear? config)
    (exec queries/clear-db! {})
    (throw (RuntimeException. "Clearing database is not allowed! check that you run with correct mode"))))

(defn list-forms []
  (->> {}
       (exec queries/list-forms)))

(defn get-form [id]
  (->> (exec queries/get-form {:id id})
       first))

(defn update-submission! [form-id submission-id answers]
  (->> {:form_id (Long. form-id) :submission_id (Long. submission-id) :answers answers}
       (exec queries/update-submission!)
       :id))

(defn create-submission! [form-id answers]
  (->> {:form_id form-id
        :answers answers}
       (exec queries/create-submission<!)
       :id))

(defn get-form-submission [form-id submission-id]
  (->> {:form_id (Long. form-id)
        :submission_id (Long. submission-id)}
       (exec queries/get-form-submission)
       first))
