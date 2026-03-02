/**
 * CardWarper.h
 * 
 * Module de normalisation perspective pour cartes CIN.
 * Transforme un quadrilatère détecté en image rectangulaire fixe 1000×630 px.
 * 
 * Architecture:
 *   - Indépendant de CardDetector (gelé)
 *   - Purement géométrique, pas de validation layout
 *   - Pas d'anti-spoof ici
 * 
 * Usage:
 *   CardWarper warper;
 *   cv::Mat normalized = warper.warp(frame, quadPoints);
 */

#ifndef CARD_WARPER_H
#define CARD_WARPER_H

#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <vector>

namespace warp {

/**
 * Configuration du warper
 */
struct WarpConfig {
    // Dimensions de sortie fixes
    int outputWidth  = 1000;
    int outputHeight = 630;
    
    // Correction gamma automatique
    bool  gammaEnabled    = true;
    float gammaValue      = 1.2f;   // Valeur gamma à appliquer
    float gammaMeanMin    = 80.f;   // Appliquer gamma si mean < ce seuil
    float gammaMeanMax    = 200.f;  // Appliquer gamma inverse si mean > ce seuil
};

/**
 * Résultat du warp avec métadonnées
 */
struct WarpResult {
    cv::Mat warpedImage;          // Image normalisée 1000×630
    bool    success;              // true si warp réussi
    float   meanLuminance;        // Luminance moyenne après warp
    bool    gammaApplied;         // true si correction gamma appliquée
    float   gammaUsed;            // Valeur gamma utilisée (1.0 si non appliquée)
    
    // Coins triés utilisés pour le warp
    std::vector<cv::Point2f> sortedCorners;  // TL, TR, BR, BL
};

/**
 * Classe CardWarper
 * 
 * Responsabilité unique: transformer un quad détecté en image rectangulaire normalisée.
 */
class CardWarper {
public:
    /**
     * Constructeur avec configuration par défaut
     */
    CardWarper();
    
    /**
     * Constructeur avec configuration personnalisée
     */
    explicit CardWarper(const WarpConfig& config);
    
    /**
     * Applique la transformation perspective
     * 
     * @param frame       Image source (BGR ou grayscale)
     * @param quadPoints  4 points du quadrilatère détecté (ordre quelconque)
     * @return            Résultat avec image normalisée 1000×630
     */
    WarpResult warp(const cv::Mat& frame, const std::vector<cv::Point2f>& quadPoints);
    
    /**
     * Version simplifiée retournant uniquement l'image
     * 
     * @param frame       Image source
     * @param quadPoints  4 points du quadrilatère
     * @return            Image warpée ou Mat vide si échec
     */
    cv::Mat warpSimple(const cv::Mat& frame, const std::vector<cv::Point2f>& quadPoints);
    
    /**
     * Trie les 4 coins dans l'ordre: TL, TR, BR, BL
     * 
     * @param pts  4 points dans un ordre quelconque
     * @return     4 points triés [TL, TR, BR, BL]
     */
    static std::vector<cv::Point2f> sortCorners(const std::vector<cv::Point2f>& pts);
    
    /**
     * Applique correction gamma à une image
     * 
     * @param img    Image source
     * @param gamma  Valeur gamma (< 1 éclaircit, > 1 assombrit)
     * @return       Image corrigée
     */
    static cv::Mat applyGamma(const cv::Mat& img, float gamma);
    
    /**
     * Calcule la luminance moyenne d'une image
     * 
     * @param img  Image (BGR ou grayscale)
     * @return     Luminance moyenne [0-255]
     */
    static float computeMeanLuminance(const cv::Mat& img);
    
    /**
     * Accesseur configuration
     */
    const WarpConfig& getConfig() const { return config_; }
    
    /**
     * Modificateur configuration
     */
    void setConfig(const WarpConfig& config) { config_ = config; }

private:
    WarpConfig config_;
    
    // LUT pré-calculée pour gamma (optimisation)
    cv::Mat gammaLUT_;
    float   lastGamma_ = 0.f;
    
    /**
     * Pré-calcule la LUT gamma si nécessaire
     */
    void updateGammaLUT(float gamma);
};

} // namespace warp

#endif // CARD_WARPER_H
